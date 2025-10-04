// server.js — FINAL (inside /src)

const path = require("path");
const fs = require("fs");
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

// -------------------- MIDDLEWARE --------------------
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static: public/ at project root (../public)
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// -------------------- MONGODB --------------------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// -------------------- CLOUDINARY --------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});
console.log("✅ Cloudinary Configured");

// -------------------- SCHEMAS --------------------
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash expected
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

// -------------------- MULTER (LOCAL UPLOADS) --------------------
const uploadsDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single("chatfile");

// -------------------- API ROUTES --------------------

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "Invalid username or password." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, message: "Invalid username or password." });

    res.json({ success: true, message: "Login successful.", username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server login error." });
  }
});

// Profile update
app.post("/api/profile/update", async (req, res) => {
  try {
    const { username, bio, bestSnakeScore } = req.body || {};
    if (!username) return res.status(400).json({ success: false, message: "Username is required." });

    const update = {};
    if (bio !== undefined) update.bio = bio;
    if (bestSnakeScore !== undefined) update.bestSnakeScore = bestSnakeScore;

    const updated = await User.findOneAndUpdate({ username }, { $set: update }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "User not found." });

    res.json({ success: true, message: "Profile updated.", user: updated });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// Profile picture upload
app.post("/api/profile/upload", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(500).json({ success: false, message: `Upload Error: ${err.message}` });

    const username = req.body?.username;
    if (!username || !req.file) {
      return res.status(400).json({ success: false, message: "Username or file missing." });
    }

    const publicPath = req.file.path.replace(/\\/g, "/").split("public/")[1];
    try {
      await User.findOneAndUpdate({ username }, { profilePicture: publicPath }, { new: true });
      res.json({ success: true, message: "Profile picture updated.", profilePicture: publicPath });
    } catch (e) {
      console.error("Save profile pic error:", e);
      res.status(500).json({ success: false, message: "Error saving profile picture." });
    }
  });
});

// -------------------- PAGE ROUTES --------------------
const page = (name) => (req, res) =>
  res.sendFile(path.join(__dirname, "../public", `${name}.html`));

app.get("/", page("login"));
app.get("/chat", page("chat"));
app.get("/profile", page("profile"));
app.get("/games", page("games"));
app.get("/videos", page("videos"));
app.get("/about", page("about"));
app.get("/signup", page("signup"));
app.get("/client", page("client"));

// 404 fallback
app.use((req, res) => {
  const notFound = path.join(__dirname, "../public/404.html");
  if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound);
  res.status(404).send("Not Found");
});

// -------------------- SOCKET.IO --------------------
const connectedUsers = {}; // ✅ only once

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  socket.on("register", (username) => {
    if (!username) return;
    connectedUsers[username] = socket.id;
    io.emit("updateUsers", Object.keys(connectedUsers));
  });

  socket.on("chatMessage", ({ user, text }) => {
    io.emit("chatMessage", { user: user || "Guest", text: text || "", time: new Date() });
  });

  socket.on("pm", ({ to, from, text }) => {
    const sid = connectedUsers[to];
    if (sid) io.to(sid).emit("pm", { from, text, time: new Date() });
  });

  socket.on("disconnect", () => {
    for (const [u, id] of Object.entries(connectedUsers)) {
      if (id === socket.id) delete connectedUsers[u];
    }
    io.emit("updateUsers", Object.keys(connectedUsers));
    console.log("❌ User disconnected:", socket.id);
  });
});

// -------------------- START --------------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
