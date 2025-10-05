// ✅ server.js — Final Render Ready Version

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
const nodemailer = require("nodemailer");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// ------------------------------
// 🔹 Middleware
// ------------------------------
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ------------------------------
// 🔹 MongoDB Connection
// ------------------------------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ------------------------------
// 🔹 Cloudinary Config
// ------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || "demo",
  api_key: process.env.API_KEY || "123456",
  api_secret: process.env.API_SECRET || "abcxyz",
});

// ------------------------------
// 🔹 Mongoose Schemas
// ------------------------------
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub." },
  profilePicture: { type: String, default: "uploads/default_avatar.jpg" },
  bestSnakeScore: { type: Number, default: 0 },
});

const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  fileData: String,
  fileMimeType: String,
  originalName: String,
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Message = mongoose.model("Message", MessageSchema);

// ------------------------------
// 🔹 Multer (File Upload)
// ------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(__dirname, "public/uploads")),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/ /g, "_")),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("chatFile");

// ------------------------------
// 🔹 REST API Routes
// ------------------------------

// 🟢 Signup Route
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const exists = await User.findOne({ username });
    if (exists)
      return res.json({ success: false, message: "Username already exists" });

    const hash = await bcrypt.hash(password, 10);
    await new User({ username, password: hash }).save();

    res.json({ success: true, message: "Signup successful!" });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 🟢 Login Route
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.json({ success: false, message: "Wrong password" });

    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ------------------------------
// 🔹 File Upload API
// ------------------------------
app.post("/upload", (req, res) => {
  upload(req, res, (err) => {
    if (err) return res.json({ success: false, message: err.message });
    if (!req.file)
      return res.json({ success: false, message: "No file uploaded" });

    res.json({
      success: true,
      fileUrl: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });
  });
});

// ------------------------------
// 🔹 Serve HTML Pages
// ------------------------------
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"))
);

app.get("/:page", (req, res) => {
  const file = path.join(__dirname, "public", `${req.params.page}`);
  res.sendFile(file, (err) => {
    if (err)
      res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
  });
});

// ------------------------------
// ⚡ SOCKET.IO CHAT SYSTEM
// ------------------------------
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  // Register User
  socket.on("registerUser", (username) => {
    if (!username) return;
    connectedUsers[username] = socket.id;
    io.emit("updateUserList", Object.keys(connectedUsers));
  });

  // Private Messaging
  socket.on("privateMessage", async (msg) => {
    const { sender, receiver, text, fileUrl, mimeType, originalName } = msg;
    const message = new Message({
      sender,
      receiver,
      text,
      fileData: fileUrl,
      fileMimeType: mimeType,
      originalName,
    });
    await message.save();

    if (connectedUsers[receiver])
      io.to(connectedUsers[receiver]).emit("privateMessage", msg);
    socket.emit("privateMessage", msg);
  });

  // Chat History
  socket.on("loadChat", async ({ user1, user2 }) => {
    const chats = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    }).sort({ timestamp: 1 });
    socket.emit("chatHistory", chats);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (let user in connectedUsers) {
      if (connectedUsers[user] === socket.id) {
        delete connectedUsers[user];
        break;
      }
    }
    io.emit("updateUserList", Object.keys(connectedUsers));
    console.log("❌ User disconnected:", socket.id);
  });
});

// ------------------------------
// 🔹 Start Server
// ------------------------------
const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
