// src/server.js के शुरुआत में
// ... (Your existing code)

// Serving static files (HTML, CSS, JS)
// FIX: Using '../public' to go up one directory level
app.use(express.static(path.join(__dirname, '../public'))); 

// Multer Uploads Path
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // FIX: Using '../public/uploads' 
    cb(null, path.join(__dirname, '../public/uploads')); 
  },
  // ... (rest of the file remains the same)

// src/server.js - FINAL WORKING CODE

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

// --- SERVER SETTINGS & MIDDLEWARE ---
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// FIX: Serving static files from the 'public' folder (Correct Path relative to src)
app.use(express.static(path.join(__dirname, "../public"))); 

// --- MONGO DB CONNECTION ---
// 🚨 NOTE: Using your hardcoded Atlas URI.
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// --- MONGOOSE SCHEMAS (All necessary schemas included) ---
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
    // Correct path for uploads
    cb(null, path.join(__dirname, "../public/uploads"));
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

// --- API AND AUTHENTICATION ROUTES ---

// Login API (This is the route failing)
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, message: "Invalid username or password." });
    }

    res.json({ success: true, message: "Login successful.", username: user.username });
  } catch (error) {
    console.error("Login error:", error);
    // ⚠️ Server error logging added
    res.status(500).json({ success: false, message: "Server login error. Check logs." });
  }
});

// ... (Other API routes: /api/signup, /api/profile, /api/scores are omitted here for brevity but were correct in previous responses) ...

// --- ROUTING AND STATIC FILES ---

// Serve files from 'public' and 'public/uploads'
app.use(express.static(path.join(__dirname, "../public"))); 
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads"))); 

// Route for Login/Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

// Generic route for other HTML files
app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, '../public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
        }
    });
});

// --- SOCKET.IO CHAT LOGIC (Omitted for brevity, but use the full code from previous answer) ---
const connectedUsers = {};

io.on("connection", (socket) => {
    // ... (Your Socket.IO Logic) ...
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
