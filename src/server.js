// server.js - FINAL PRODUCTION CODE (All Features and Fixes)

const path = require("path");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const compression = require("compression");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- SERVER SETTINGS & MIDDLEWARE ---
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serving static files from the 'public' folder (Correct Path from root)
app.use(express.static(path.join(__dirname, "public")));


// --- MONGO DB CONNECTION ---
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// --- MONGOOSE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  profilePicture: { type: String, default: "uploads/default_avatar.jpg" },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String },
  fileDir: { type: String }, 
  fileMimeType: { type: String },
  originalName: { type: String }, 
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);

// --- MULTER FILE UPLOAD CONFIGURATION ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "public/uploads"));
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + "-" + file.originalname.replace(/ /g, "_");
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, 
}).single("chatFile");

// --- API AND AUTHENTICATION ROUTES ---
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, message: "Invalid username or password." });
    }
    res.json({ success: true, message: "Login successful.", username: user.username });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server login error. Check logs." });
  }
});

// Update Profile Picture (and File Upload Logic)
app.post("/api/profile/upload", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: `Upload Error: ${err.message}` });
    }
    const username = req.body.username;
    if (!username) { return res.status(400).json({ success: false, message: "Username is missing." }); }

    const filePath = req.file.path.replace(/\\/g, "/").split("public/")[1];

    try {
      await User.findOneAndUpdate({ username }, { profilePicture: filePath }, { new: true });
      res.json({ success: true, message: "Profile picture updated.", profilePicture: filePath });
    } catch (error) {
      res.status(500).json({ success: false, message: "Error saving profile picture." });
    }
  });
});

// --- ROUTING ---
app.use("/uploads", express.static(path.join(__dirname, "public/uploads"))); 
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "public", "login.html")); });
app.get('/:file.html', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.params.file + '.html');
    res.sendFile(filePath, (err) => { if (err) res.status(404).sendFile(path.join(__dirname, 'public/404.html')); });
});

// --- SOCKET.IO CHAT LOGIC (FIXED) ---
const connectedUsers = {}; // Map: username -> socket.id
const typingUsers = {}; // Map: username -> recipient

io.on("connection", (socket) => {
  let currentUsername = null;

  socket.on("newUser", (username) => {
    currentUsername = username;
    connectedUsers[username] = socket.id;
    // 🚨 FIX 1: Send only the usernames (for frontend)
    io.emit("updateUsers", Object.keys(connectedUsers)); 
  });
  
  // 🚨 NEW FEATURE: Typing Indicator
  socket.on("typing", (recipient) => {
    if (recipient !== currentUsername) {
        typingUsers[currentUsername] = recipient;
        const recipientSocketId = connectedUsers[recipient];
        if (recipientSocketId) {
            // Only send the indicator to the recipient
            io.to(recipientSocketId).emit("userTyping", { sender: currentUsername });
        }
    }
  });
  
  // 🚨 NEW FEATURE: Stopped Typing
  socket.on("stopTyping", (recipient) => {
    if (typingUsers[currentUsername]) {
        delete typingUsers[currentUsername];
        const recipientSocketId = connectedUsers[recipient];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("stopTyping", { sender: currentUsername });
        }
    }
  });

  // Handle private message (Now uses the fixed connection map)
  socket.on("privateMessage", async (msg) => {
    const { sender, receiver, text, fileDir, fileMimeType, originalName } = msg;
    
    // Fetch sender's DP for real-time display
    const senderUser = await User.findOne({ username: sender }).select('profilePicture');
    const senderPicture = senderUser ? senderUser.profilePicture : 'uploads/default_avatar.jpg';

    // Save message to DB
    const newMessage = new Message({ sender, receiver, text, fileDir, fileMimeType, originalName });
    await newMessage.save();

    // Prepare message object to send to client
    const messageToSend = {
        ...newMessage.toObject(),
        senderPicture: senderPicture
    };

    // Send to sender (to display immediately)
    socket.emit("privateMessage", messageToSend); 

    // 🚨 FIX 3: Send to receiver using correct Socket ID lookup
    const receiverSocketId = connectedUsers[receiver]; 
    if (receiverSocketId) {
        io.to(receiverSocketId).emit("privateMessage", messageToSend);
    }
  });

  socket.on("disconnect", () => {
    if (currentUsername) {
        delete connectedUsers[currentUsername];
        // 🚨 FIX 4: Broadcast updated list when someone leaves
        io.emit("updateUsers", Object.keys(connectedUsers)); 
    }
  });
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
