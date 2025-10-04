const path = require("path");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const compression = require("compression");
const { v2: cloudinary } = require("cloudinary");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- SERVER SETTINGS & MIDDLEWARE ---
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// FIX: Public folder is in root (one level up from /src)
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/uploads", express.static(path.join(__dirname, "..", "public/uploads")));

// --- MONGO DB CONNECTION ---
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// --- CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "your_cloud_name",
  api_key: process.env.CLOUDINARY_API_KEY || "your_api_key",
  api_secret: process.env.CLOUDINARY_API_SECRET || "your_api_secret",
});
console.log("✅ Cloudinary Configured");

// --- MONGOOSE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub.", maxlength: 160 },
  profilePicture: { type: String, default: "uploads/default_avatar.jpg" },
  bestSnakeScore: { type: Number, default: 0 },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
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

// --- MULTER FILE UPLOAD CONFIGURATION ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "public/uploads"));
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + "-" + file.originalname.replace(/ /g, "_");
    cb(null, filename);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single("chatfile");

// --- API ROUTES ---
// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, message: "Invalid username or password." });
    }
    res.json({ success: true, message: "Login successful.", username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PROFILE UPDATE
app.post("/api/profile/update", async (req, res) => {
  try {
    const { username, bio, bestSnakeScore } = req.body;
    const updateFields = {};
    if (bio) updateFields.bio = bio;
    if (bestSnakeScore) updateFields.bestSnakeScore = bestSnakeScore;

    const updatedUser = await User.findOneAndUpdate({ username }, { $set: updateFields }, { new: true });
    if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ success: false, message: "Error updating profile" });
  }
});

// PROFILE PICTURE UPLOAD
app.post("/api/profile/upload", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    const username = req.body.username;
    if (!username) return res.status(400).json({ success: false, message: "Username required" });

    const filePath = req.file.path.replace(/\\/g, "/").split("public/")[1];
    try {
      await User.findOneAndUpdate({ username }, { profilePicture: filePath }, { new: true });
      res.json({ success: true, profilePicture: filePath });
    } catch (error) {
      res.status(500).json({ success: false, message: "Error saving profile picture" });
    }
  });
});

// --- PAGE ROUTES ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "login.html")));
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "chat.html")));
app.get("/profile", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "profile.html")));
app.get("/games", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "games.html")));
app.get("/videos", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "videos.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "about.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "signup.html")));
app.get("/client", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "client.html")));

// --- SOCKET.IO CHAT LOGIC ---
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("register", (username) => {
    connectedUsers[username] = socket.id;
    io.emit("updateUsers", Object.keys(connectedUsers));
  });

  socket.on("chatMessage", (data) => {
    io.emit("chatMessage", { user: data.user, text: data.text, time: new Date() });
  });

  socket.on("disconnect", () => {
    for (const [user, id] of Object.entries(connectedUsers)) {
      if (id === socket.id) delete connectedUsers[user];
    }
    io.emit("updateUsers", Object.keys(connectedUsers));
    console.log("User disconnected:", socket.id);
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
