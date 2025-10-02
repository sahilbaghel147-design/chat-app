// src/server.js - FINAL FULL CODE with Cloudinary
const path = require("path");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const compression = require("compression");
const cloudinary = require("cloudinary").v2;

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- Middleware ---
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// --- MongoDB Connection ---
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

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  bio: {
    type: String,
    default: "Hey there! I'm new to Aura Hub.",
    maxlength: 160,
  },
  profilePicture: {
    type: String,
    default:
      "https://res.cloudinary.com/demo/image/upload/v123456/default_avatar.png",
  },
  bestSnakeScore: { type: Number, default: 0 },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String },
  text: { type: String },
  avatar: { type: String },
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

// --- Cloudinary Config ---
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// --- Multer (Memory Storage for Cloudinary Uploads) ---
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Auth APIs ---
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

// --- Profile Picture Upload (Cloudinary) ---
app.post("/api/profile/upload", upload.single("chatfile"), async (req, res) => {
  try {
    const username = req.body.username;
    if (!username) {
      return res.status(400).json({ success: false, message: "Username missing" });
    }

    // Upload to Cloudinary
    const stream = cloudinary.uploader.upload_stream(
      { folder: "aura-hub-avatars", resource_type: "image" },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary Upload Error:", error);
          return res.status(500).json({ success: false, message: "Cloud upload failed" });
        }

        // Update user profile in DB
        await User.findOneAndUpdate(
          { username },
          { profilePicture: result.secure_url },
          { new: true }
        );

        res.json({
          success: true,
          message: "Profile picture updated",
          profilePicture: result.secure_url,
        });
      }
    );

    stream.end(req.file.buffer);
  } catch (err) {
    console.error("Profile Upload Error:", err);
    res.status(500).json({ success: false, message: "Server error in upload" });
  }
});

// --- Bio Update ---
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

// --- Static Routes ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

app.get("/:file.html", (req, res) => {
  const fileName = req.params.file + ".html";
  const filePath = path.join(__dirname, "../public", fileName);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send("404 Not Found");
    }
  });
});

// --- Socket.IO with Avatars ---
let onlineUsers = [];

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("join", ({ username, avatar }) => {
    socket.username = username;
    socket.avatar = avatar && avatar.trim() !== "" ? avatar : "https://res.cloudinary.com/demo/image/upload/v123456/default_avatar.png";

    if (!onlineUsers.find((u) => u.username === username)) {
      onlineUsers.push({ username, avatar: socket.avatar });
    }

    io.emit("updateUsers", onlineUsers);
  });

  socket.on("chatMessage", (msg) => {
    io.emit("message", msg);
  });

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter((u) => u.username !== socket.username);
    io.emit("updateUsers", onlineUsers);
    console.log("Client disconnected");
  });
});

// --- Server Start ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
