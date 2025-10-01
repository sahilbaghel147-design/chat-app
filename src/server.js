// src/server.js - FINAL AND CORRECT CODE

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
app.use(express.static("public")); // Correctly serving static files

// --- MONGO DB CONNECTION (Using your provided URI) ---
// 🚨 NOTE: Please ensure this URI is correct.
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority"; 

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

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
    // FIX: Correct path relative to src/server.js
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

// Login API
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
    res.status(500).json({ success: false, message: "Server login error." });
  }
});

// Update Profile API
app.post("/api/profile/update", async (req, res) => {
  const { username, bio } = req.body;

  try {
    const updateFields = {};
    if (bio !== undefined) updateFields.bio = bio;

    const updatedUser = await User.findOneAndUpdate(
      { username },
      { $set: updateFields },
      { new: true }
    );

    res.json({ success: true, message: "Profile updated successfully.", user: updatedUser });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ success: false, message: "Failed to update profile." });
  }
});

// File Upload API
app.post("/api/profile/upload", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: `Upload Error: ${err.message}` });
    }
    // ... (rest of the upload logic)
    const filePath = req.file.path.replace(/\\/g, "/").split("public/")[1];

    res.json({ success: true, message: "Profile picture updated.", profilePicture: filePath });
  });
});

// --- ROUTE TO SERVE HTML PAGES ---
app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, '../public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
        }
    });
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- SOCKET.IO CHAT LOGIC ---
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("register", (username) => {
    connectedUsers[username] = socket.id;
    io.emit("user_online", Object.keys(connectedUsers));
  });

  socket.on("private_message", async (msg) => {
    // ... (rest of the message logic) ...
  });

  socket.on("disconnect", () => {
    for (const username in connectedUsers) {
      if (connectedUsers[username] === socket.id) {
        delete connectedUsers[username];
        io.emit("user_offline", Object.keys(connectedUsers));
        break;
      }
    }
  });
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
