const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const compression = require("compression");
const path = require("path");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(express.static(path.join(__dirname, "../public")));

// ================== DATABASE (MongoDB Atlas URL) ==================
mongoose
  .connect(
    "mongodb+srv://sahilbaghel147:Sahil123@cluster0.plvyk.mongodb.net/chatapp?retryWrites=true&w=majority",
    { useNewUrlParser: true, useUnifiedTopology: true }
  )
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ================== SCHEMAS ==================
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  avatar: { type: String, default: "/uploads/default_avatar.jpg" },
  bio: { type: String, default: "" },
});

const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  avatar: String,
  time: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// ================== CLOUDINARY CONFIG ==================
cloudinary.config({
  cloud_name: "dwbp5c6xi",   // ✅ Tera Cloudinary Cloud Name
  api_key: "173424873274959",  // ✅ Tera API Key
  api_secret: "wV5xytTDOV2LhuvMEsEdr7hbdyM", // ✅ Tera API Secret
});

// ================== MULTER (Memory Storage) ==================
const upload = multer({ storage: multer.memoryStorage() });

// ================== ROUTES ==================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Upload profile picture to Cloudinary
app.post("/api/upload", upload.single("avatar"), (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file uploaded" });

  const stream = cloudinary.uploader.upload_stream(
    { folder: "profile_pics" },
    (err, result) => {
      if (err) {
        console.error("Upload Error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Upload failed", error: err.message });
      }
      res.json({ success: true, url: result.secure_url });
    }
  );

  stream.end(req.file.buffer);
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

  // Receive chat message
  socket.on("chatMessage", async (data) => {
    const newMsg = new Message({
      username: data.username,
      text: data.text,
      avatar: data.avatar,
    });
    await newMsg.save();

    io.emit("message", {
      username: data.username,
      text: data.text,
      avatar: data.avatar,
      time: new Date(),
    });
  });

  // Update online users
  socket.on("join", async (user) => {
    socket.username = user.username;
    socket.avatar = user.avatar;

    const users = [];
    for (let [id, s] of io.of("/").sockets) {
      users.push({ username: s.username, avatar: s.avatar });
    }
    io.emit("updateUsers", users);
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected");
    const users = [];
    for (let [id, s] of io.of("/").sockets) {
      users.push({ username: s.username, avatar: s.avatar });
    }
    io.emit("updateUsers", users);
  });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
