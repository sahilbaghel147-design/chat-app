// src/server.js - FINAL FULL FIXED CODE
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
const io = socketio(server);

// --- MIDDLEWARE ---
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files from /public
app.use(express.static(path.join(__dirname, "../..", "public")));

// --- DATABASE CONNECTION ---
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected Successfully!"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  bio: {
    type: String,
    default: "Hey there! I'm new to Aura Hub.",
    maxlength: 160,
  },
  profilePicture: { type: String, default: "/uploads/default_avatar.jpg" },
  bestSnakeScore: { type: Number, default: 0 },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String },
  text: { type: String },
  fileData: { type: String },
  fileMimeType: { type: String },
  originalName: { type: String },
  timestamp: { type: Date, default: Date.now },
});

const HighScoreSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  score: { type: Number, required: true, default: 0 },
  game: { type: String, default: "Snake" },
  date: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);
const HighScore = mongoose.model("HighScore", HighScoreSchema);

// --- FILE UPLOAD (Multer) ---
// ✅ Correct uploads path
const uploadsPath = path.resolve(__dirname, "../..", "public/uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + "-" + file.originalname.replace(/ /g, "_");
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("chatfile");

// --- API ROUTES ---

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing) {
      return res.json({ success: false, message: "Username already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashed });
    await newUser.save();

    res.json({ success: true, message: "Signup successful." });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ success: false, message: "Server signup error." });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({ success: false, message: "Invalid credentials." });
    }

    res.json({
      success: true,
      message: "Login successful.",
      username: user.username,
      profilePicture: user.profilePicture,
      bio: user.bio,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server login error." });
  }
});

// ✅ Profile Picture Upload Route (FIXED PATH)
app.post("/api/profile/upload", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Upload Error:", err);
      return res.status(500).json({ success: false, message: `Upload Error: ${err.message}` });
    }

    const username = req.body.username;
    if (!username) {
      return res.status(400).json({ success: false, message: "Username is missing." });
    }

    // ✅ Store only relative path
    const filePath = "/uploads/" + req.file.filename;

    try {
      await User.findOneAndUpdate(
        { username },
        { profilePicture: filePath },
        { new: true }
      );

      res.json({
        success: true,
        message: "Profile picture updated.",
        profilePicture: filePath,
      });
    } catch (error) {
      console.error("Save Error:", error);
      res.status(500).json({ success: false, message: "Error saving profile picture." });
    }
  });
});

// ✅ Bio Update Route
app.post("/api/profile/bio", async (req, res) => {
  try {
    const { username, bio } = req.body;
    if (!username || !bio) {
      return res.json({ success: false, message: "Missing username or bio." });
    }

    await User.findOneAndUpdate({ username }, { bio }, { new: true });

    res.json({ success: true, message: "Bio updated successfully.", bio });
  } catch (err) {
    console.error("Bio update error:", err);
    res.status(500).json({ success: false, message: "Error updating bio." });
  }
});

// --- STATIC PAGES ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../..", "public", "login.html"));
});

app.get("/:file.html", (req, res) => {
  const fileName = req.params.file + ".html";
  const filePath = path.join(__dirname, "../..", "public", fileName);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send("404 Not Found");
    }
  });
});

// --- SOCKET.IO WITH ONLINE USERS ---
let onlineUsers = [];

io.on("connection", (socket) => {
  console.log("New client connected");

  // User joins
  socket.on("join", (username) => {
    socket.username = username;
    if (!onlineUsers.includes(username)) {
      onlineUsers.push(username);
    }
    io.emit("updateUsers", onlineUsers);
  });

  // Chat messages
  socket.on("chatMessage", (msg) => {
    io.emit("message", msg);
  });

  // Disconnect
  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter((u) => u !== socket.username);
    io.emit("updateUsers", onlineUsers);
    console.log("Client disconnected");
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
