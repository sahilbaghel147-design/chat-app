// server.js - Final Code with Auth, Private Messaging, File Sharing & Optimization
// server.js की शुरुआत
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // <--- यह लाइन यहाँ होनी चाहिए
const bodyParser = require("body-parser");
//... बाकी requires

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

// 1. Production Optimization and Security
app.use(cors()); 
app.use(compression()); 

// 2. Standard Middleware
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));


// ===========================================
// === MONGO DB CONNECTION ===
// ===========================================

// IMPORTANT: Using your provided hardcoded connection string.
// For best practice, use a Render Environment Variable (process.env.MONGODB_URI)
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp";

mongoose.connect(MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
}).then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));


// ===========================================
// === MONGO DB SCHEMAS ===
// ===========================================

// User Schema (Auth)
const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model("User", UserSchema);

// Private Message Schema (Updated for file details)
const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  fileUrl: { type: String, default: null },        // NEW: Stores file URL
  mimeType: { type: String, default: null },       // NEW: Stores file type
  originalName: { type: String, default: null },   // NEW: Stores original filename
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);


// ===========================================
// === MULTER FILE UPLOAD CONFIGURATION ===
// ===========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Files are saved to the 'public/uploads' directory
        cb(null, 'public/uploads'); 
    },
    filename: (req, file, cb) => {
        // Unique filename: (timestamp)-(original filename)
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
// === API AND AUTHENTICATION ROUTES ===
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

// ✅ File Upload API Route
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
// === STATIC FILES AND ROUTING ===
// ===========================================

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); 

// Route for the root file (your login page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Generic route for other HTML files (e.g., /client.html, /games.html, /videos.html)
app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, 'public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            // Handle 404 for missing files
            res.status(404).sendFile(path.join(__dirname, 'public', '404.html') || 'File Not Found');
        }
    });
});


// ===========================================
// === SOCKET.IO COMMUNICATION LOGIC ===
// ===========================================

const io = socketIO(server, {
    cors: {
        origin: "*", // Allows connections from all origins (Render requires this)
        methods: ["GET", "POST"]
    }
});

let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("newUser", (username) => {
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("updateUsers", Object.keys(onlineUsers));
  });

  // ✅ Load old chat between 2 users
  socket.on("loadChat", async ({ user1, user2 }) => {
    // Fetches all fields including the new file fields
    const chats = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });

    socket.emit("chatHistory", chats);
  });

  // ✅ Send private message (Handles both text and file data)
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
    const messageToSend = { 
        sender, 
        text, 
        fileUrl: fileUrl || null, 
        mimeType: mimeType || null, 
        originalName: originalName || null 
    };

    // Send to sender (to display immediately)
    socket.emit("privateMessage", messageToSend);

    // Send to receiver if online
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("privateMessage", messageToSend);
    }
  });

  socket.on("disconnect", () => {
    // Clean up online user list
    delete onlineUsers[socket.username];
    io.emit("updateUsers", Object.keys(onlineUsers));
    console.log("User disconnected");
  });
});


// ===========================================
// === SERVER STARTUP ===
// ===========================================
const PORT = process.env.PORT || 4000; // Using 4000 as per your original code
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

