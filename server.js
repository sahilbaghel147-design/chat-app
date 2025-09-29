// Gemini AI setup
const { GoogleGenAI } = require("@google/genai"); 
// 🚨 IMPORTANT: यहाँ अपनी API Key डालें या Environment Variable का उपयोग करें (सुरक्षा के लिए बेहतर)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE"; 
const ai = new GoogleGenAI({ apiKey: AIzaSyA2JdSuMrAQHaOHDPmGxxggpmqKq2GWwTM });
const model = "gemini-2.5-flash"; // Fast and capable model




// server.js - Final Guaranteed Clean Code (No 'document' Error)

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require('cors');
const path = require("path");
const multer = require('multer'); 
const compression = require('compression'); 

const app = express();
const server = http.createServer(app);

// === SERVER SETTINGS & MIDDLEWARE ===
app.use(cors()); 
app.use(compression()); 
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ===========================================
// === MONGO DB CONNECTION & SCHEMAS ===
// ===========================================

// IMPORTANT: Replace with your actual connection string 
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp"; 

mongoose.connect(MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
}).then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

// User Schema
const UserSchema = new mongoose.Schema({ username: String, password: String });
const User = mongoose.model("User", UserSchema);

// Message Schema (Updated for file sharing)
const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  fileUrl: { type: String, default: null },
  mimeType: { type: String, default: null },
  originalName: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// ===========================================
// === MULTER FILE UPLOAD CONFIGURATION ===
// ===========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads'); 
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')); 
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB
}).single('chatFile'); 


// ===========================================
// === API AND AUTHENTICATION ROUTES ===
// ===========================================

app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (await User.findOne({ username })) {
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

app.post('/upload', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            console.error('Upload Error:', err);
            return res.status(500).json({ success: false, message: err.message || "File upload failed." });
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

app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); 

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

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
// === SOCKET.IO COMMUNICATION LOGIC ===
// ===========================================

const io = socketIO(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

let onlineUsers = {};

io.on("connection", (socket) => {
  
  socket.on("newUser", (username) => {
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("updateUsers", Object.keys(onlineUsers));
  });

  socket.on("loadChat", async ({ user1, user2 }) => {
    const chats = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });
    socket.emit("chatHistory", chats);
  });

  socket.on("privateMessage", async (data) => {
    const { sender, receiver, text, fileUrl, mimeType, originalName } = data;
    
    const newMessage = new Message({ sender, receiver, text, fileUrl, mimeType, originalName });
    await newMessage.save();

    const messageToSend = { sender, text, fileUrl, mimeType, originalName };

    socket.emit("privateMessage", messageToSend);

    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("privateMessage", messageToSend);
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.username];
    io.emit("updateUsers", Object.keys(onlineUsers));
  });
});


// ===========================================
// === SERVER STARTUP ===
// ===========================================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

