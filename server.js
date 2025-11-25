// ===== server.js - FIXED AND COMPLETE VERSION =====

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const compression = require("compression");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const dotenv = require("dotenv");

// .env फ़ाइल से environment variables लोड करें (PORT, MONGODB_URI)
dotenv.config();

const app = express();
const server = http.createServer(app);

// --- MONGODB CONNECTION ---
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/chat_app";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("💾 MongoDB Connected Successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

// --- USER MODEL DEFINITION ---
// एक साधारण User Schema/Model, जिसका उपयोग Auth routes में किया गया है।
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: "" },
  profilePicture: { type: String, default: "/images/default-profile.png" },
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);

// --- SOCKET.IO SETUP ---
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// --- SOCKET.IO LOGIC ---
// एक बुनियादी chat/messaging लॉजिक
io.on("connection", (socket) => {
  console.log("🟢 A user connected:", socket.id);

  // जब क्लाइंट 'joinRoom' इवेंट भेजता है
  socket.on("joinRoom", (roomName, callback) => {
    socket.join(roomName);
    console.log(`${socket.id} joined room: ${roomName}`);
    if (callback) callback({ success: true, message: `Joined ${roomName}` });
  });

  // जब क्लाइंट 'sendMessage' इवेंट भेजता है
  socket.on("sendMessage", (messageData) => {
    // messageData = { room: 'general', user: 'user1', text: 'Hello', timestamp: '...' }
    console.log(`✉️ Message received for room ${messageData.room}: ${messageData.text}`);

    // उसी room में सभी क्लाइंट्स को मैसेज ब्रॉडकास्ट करें
    // .to(room) का उपयोग room-specific broadcast के लिए किया जाता है
    io.to(messageData.room).emit("receiveMessage", messageData);
  });

  // जब क्लाइंट डिस्कनेक्ट होता है
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// --- MIDDLEWARE ---
app.use(compression()); // Gzip compression
app.use(express.json()); // Body parser for JSON
app.use(express.urlencoded({ extended: true })); // Body parser for form data
app.use(express.static(path.join(__dirname, "public"))); // Serve static files

// ===== API ROUTES (STATIC ROUTES से ऊपर) =====

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- AUTH ROUTES ---
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation: Check if username and password are provided
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password required" });
    }

    const exists = await User.findOne({ username });
    if (exists)
      return res.status(409).json({ success: false, message: "User already exists" }); // 409 Conflict

    const hashed = await bcrypt.hash(password, 10);

    await new User({ username, password: hashed }).save();

    res.status(201).json({ success: true, message: "Signup successful" }); // 201 Created
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ success: false, message: "Invalid username or password" }); // 401 Unauthorized

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: "Invalid username or password" }); // 401 Unauthorized

    res.json({ success: true, username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// --- FILE UPLOAD ---
const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    // सुनिश्चित करें कि 'public/uploads' डायरेक्टरी मौजूद है
    cb(null, path.join(__dirname, "public/uploads")),
  filename: (req, file, cb) =>
    cb(
      null,
      "chat-" + Date.now() + "-" + file.originalname.replace(/ /g, "_")
    ),
});

const upload = multer({ storage }).single("chatFile");

app.post("/api/upload", (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      // Multer errors (like file size limit)
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!req.file)
      return res.status(400).json({ success: false, message: "No file uploaded" }); // 400 Bad Request

    res.json({
      success: true,
      fileDir: "/uploads/" + req.file.filename,
      fileMimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });
  });
});

// PROFILE ROUTE
app.get("/api/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select(
      "username bio profilePicture" // केवल ये फ़ील्ड्स retrieve करें
    );
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, profile: user });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
});

// ===== STATIC ROUTES (सबसे लास्ट में, API routes के बाद) =====

// FRONTEND PAGES
// Home page
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/index.html"))
);

// Catch all for any .html page (e.g., /chat.html, /settings.html)
// यह सुनिश्चित करता है कि आपके frontend के HTML routes काम करें।
app.get("/*.html", (req, res) => {
  const filePath = path.join(__dirname, "public", req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      // यदि फ़ाइल नहीं मिलती है, तो 404 भेजें
      res.status(404).sendFile(path.join(__dirname, "public/404.html") || "Not Found");
    }
  });
});

// Fallback for single-page applications (SPA):
// यदि कोई API route या static file match नहीं होता है, तो index.html भेजें
// ताकि frontend routing (जैसे React Router) काम कर सके।
// app.get("*", (req, res) => {
//     res.sendFile(path.join(__dirname, "public/index.html"));
// });


// --- START SERVER ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`🚀 Server live on http://localhost:${PORT}`)
);
