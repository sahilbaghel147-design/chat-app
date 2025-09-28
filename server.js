// server.js - Final Full-Featured Code

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require('cors');
const path = require("path");
// === New Dependencies for Features & Optimization ===
const multer = require('multer'); 
const compression = require('compression'); 
// ====================================================

const app = express();
const server = http.createServer(app);

// ===========================================
// === SERVER SETTINGS & MIDDLEWARE ===
// ===========================================

// 1. Production Optimization
app.use(cors()); 
app.use(compression()); 

// 2. Standard Middleware
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ===========================================
// === FILE UPLOAD CONFIGURATION (MULTER) ===
// ===========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // IMPORTANT: 'public/uploads' folder must exist in your repo
        cb(null, 'public/uploads'); 
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')); 
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|pdf|zip/;
        const mimeType = allowedTypes.test(file.mimetype);
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());

        if (mimeType && extName) {
            return cb(null, true);
        }
        cb(new Error('Only allowed file types are supported.'));
    }
}).single('chatFile'); 


// ===========================================
// === MONGO DB CONNECTION ===
// ===========================================

// You are using a hardcoded string. For production, use process.env.MONGODB_URI
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp";

mongoose.connect(MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
}).then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

// ===========================================
// === MONGO DB SCHEMAS ===
// ===========================================

// ✅ User Schema (No change)
const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model("User", UserSchema);

// ✅ Private Message Schema (Updated to store file details)
const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  fileUrl: { type: String, default: null },        // NEW
  mimeType: { type: String, default: null },       // NEW
  originalName: { type: String, default: null },   // NEW
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// ===========================================
// === AUTHENTICATION ROUTES (No Change) ===
// ===========================================

// ✅ Signup Route
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    res.json({ success: false, message: "Error in signup" });
  }
});

// ✅ Login Route
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.json({ success: false, message: "Invalid password" });

    res.json({ success: true, message: "Login successful", username });
  } catch (err) {
    res.json({ success: false, message: "Error in login" });
  }
});

// ===========================================
// === FILE UPLOAD API ROUTE (NEW) ===
// ===========================================
app.post('/upload', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            const message = err.message || "File upload failed due to server error.";
            console.error('Upload Error:', err);
            return res.status(500).json({ success: false, message: message });
        }
        
        if (!req.file) {
             return res.status(400).json({ success: false, message: "No file selected." });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            fileUrl: fileUrl, 
            originalName: req.file.originalname, 
            mimeType: req.file.mimetype 
        });
    });
});


// ===========================================
// === STATIC FILES AND ROUTING (Original URLs) ===
// ===========================================

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); 

// Your original routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/client.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "client.html"));
});
// Generic route for other HTML files (like /chat.html, /games.html, /videos.html)
app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, 'public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('404 File Not Found');
        }
    });
});


// ===========================================
// === SOCKET.IO COMMUNICATION LOGIC (UPDATED) ===
// ===========================================

let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("newUser", (username) => {
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("updateUsers", Object.keys(onlineUsers));
  });

  // ✅ Load old chat between 2 users (Updated to fetch file data too)
  socket.on("loadChat", async ({ user1, user2 }) => {
    const chats = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });

    socket.emit("chatHistory", chats);
  });

  // ✅ Send private message (UPDATED to handle file data)
  socket.on("privateMessage", async (data) => {
    const { sender, receiver, text, fileUrl, mimeType, originalName } = data;
    
    // Create new message object with all data
    const newMessage = new Message({ 
        sender, 
        receiver, 
        text, 
        fileUrl: fileUrl || null,
        mimeType: mimeType || null,
        originalName: originalName || null
    });
    await newMessage.save();

    // Prepare message object to send via socket
    const messageToSend = { sender, text, fileUrl, mimeType, originalName };

    // Send to sender
    socket.emit("privateMessage", messageToSend);

    // Send to receiver if online
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("privateMessage", messageToSend);
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.username];
    io.emit("updateUsers", Object.keys(onlineUsers));
    console.log("User disconnected");
  });
});

// ===========================================
// === START SERVER ===
// ===========================================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
