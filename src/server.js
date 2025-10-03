// ================== IMPORTS ==================
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const compression = require("compression");
const path = require("path");

// File upload
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

// ================== CONFIG ==================
dotenv.config();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(express.static(path.join(__dirname, "../public")));

// ================== DATABASE ==================
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ================== SCHEMAS ==================
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  avatar: { type: String, default: "/assets/default_avatar.png" },
  bio: { type: String, default: "" },
});

const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  time: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// ================== CLOUDINARY ==================
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profile_pics",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const upload = multer({ storage: storage });

// ================== ROUTES ==================

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Upload profile picture
app.post("/api/upload", upload.single("avatar"), (req, res) => {
  try {
    res.json({ success: true, url: req.file.path });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ success: false, message: "Upload failed", error: err });
  }
});

// Save bio
app.post("/api/bio", async (req, res) => {
  const { username, bio } = req.body;
  try {
    await User.updateOne({ username }, { bio });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
});

// ================== SOCKET.IO (CHAT) ==================
io.on("connection", (socket) => {
  console.log("🟢 User connected");

  // Listen for messages
  socket.on("chatMessage", async (data) => {
    const newMsg = new Message({ username: data.username, text: data.text });
    await newMsg.save();

    io.emit("chatMessage", {
      username: data.username,
      text: data.text,
      time: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
  });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
