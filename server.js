// ===== server.js - FINAL FIXED & RENDER READY =====

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const compression = require("compression");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const server = http.createServer(app);

// SOCKET.IO CONFIGURATION
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// EXPRESS SETTINGS & MIDDLEWARE
app.use(compression()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// ✅ MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ====== Schemas ======
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub.", maxlength: 160 },
  profilePicture: { type: String, default: "/uploads/default_avatar.png" }
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String },
  fileDir: { type: String },
  fileMimeType: { type: String },
  originalName: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const HighScoreSchema = new mongoose.Schema({
  username: { type: String, required: true },
  game: { type: String, required: true, default: "snake" },
  score: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);
const HighScore = mongoose.model("HighScore", HighScoreSchema);

// ===== Multer Config =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "public/uploads"));
  },
  filename: (req, file, cb) => {
    const prefix = req.body.isProfilePic ? "profile-" : "chat-";
    cb(null, prefix + Date.now() + "-" + file.originalname.replace(/ /g, "_"));
  }
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
}).single("chatFile");

// ===== Routes =====
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const userExists = await User.findOne({ username });
    if (userExists) return res.json({ success: false, message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashed });
    await newUser.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: "Server error during signup" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, message: "Invalid username or password" });
    }
    res.json({ success: true, message: "Login successful" });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error during login" });
  }
});

app.post("/upload", (req, res) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error("Upload Error:", err);
      return res.status(500).json({ success: false, message: "File upload failed", error: err.message });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "No file selected." });
    res.json({
      success: true,
      fileDir: "/uploads/" + req.file.filename,
      fileMimeType: req.file.mimetype,
      originalName: req.file.originalname
    });
  });
});

// ===== Profile Routes =====
app.get("/api/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select("username bio profilePicture");
    const bestScore = await HighScore.findOne({ username: req.params.username }).sort({ score: -1 });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      profile: {
        username: user.username,
        bio: user.bio,
        profilePicture: user.profilePicture,
        bestSnakeScore: bestScore ? bestScore.score : 0
      }
    });
  } catch (err) {
    console.error("Profile Fetch Error:", err);
    res.status(500).json({ success: false, message: "Server error fetching profile." });
  }
});

// ===== Socket.IO =====
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log(`✅ New connection: ${socket.id}`);

  socket.on("newUser", (username) => {
    onlineUsers[socket.id] = username;
    io.emit("updateUsers", Object.values(onlineUsers));
  });

  socket.on("privateMessage", async (msg) => {
    try {
      const newMsg = new Message(msg);
      await newMsg.save();

      const sender = await User.findOne({ username: msg.sender }).select("profilePicture");
      const messageToSend = { ...msg, senderPicture: sender?.profilePicture || "/uploads/default_avatar.png" };

      socket.emit("privateMessage", messageToSend);
      const receiverSockets = Object.keys(onlineUsers).filter(id => onlineUsers[id] === msg.receiver);
      receiverSockets.forEach(id => io.to(id).emit("privateMessage", messageToSend));
    } catch (err) {
      console.error("Private Message Error:", err);
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
    io.emit("updateUsers", Object.values(onlineUsers));
  });
});

// ===== Serve Frontend Pages =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/:fileName", (req, res) => {
  const fileName = req.params.fileName;
  if (fileName.includes("..") || !fileName.endsWith(".html")) {
    return res.status(404).sendFile(path.join(__dirname, "public/404.html"));
  }
  res.sendFile(path.join(__dirname, "public", fileName));
});

// ===== Start Server =====
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
