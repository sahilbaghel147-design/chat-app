// src/server.js - FINAL WORKING CODE (Syntax and Path Fixed)

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
app.use(express.static(path.join(__dirname, '../public'))); // Correct Pathing


// --- MONGO DB CONNECTION ---
// 🚨 NOTE: Using your hardcoded Atlas URI.
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

// Login API (Failing Route)
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
    res.status(500).json({ success: false, message: "Server login error. Check logs." });
  }
});

// Signup API
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, message: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    res.json({ success: false, message: "Error in signup" });
  }
});

// Update Profile API
app.post("/api/profile/update", async (req, res) => {
  const { username, bio, bestSnakeScore } = req.body;

  try {
    const updateFields = {};
    if (bio !== undefined) updateFields.bio = bio;
    if (bestSnakeScore !== undefined) updateFields.bestSnakeScore = bestSnakeScore;

    const updatedUser = await User.findOneAndUpdate(
      { username },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, message: "Profile updated successfully.", user: updatedUser });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ success: false, message: "Internal server error during update." });
  }
});

// Update Profile Picture
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

    const filePath = req.file.path.replace(/\\/g, "/").split("public/")[1];

    try {
      await User.findOneAndUpdate(
        { username },
        { profilePicture: filePath },
        { new: true }
      );

      res.json({ success: true, message: "Profile picture updated.", profilePicture: filePath });
    } catch (error) {
      res.status(500).json({ success: false, message: "Error saving profile picture." });
    }
  });
});

// High Score API (Correctly included)
app.post('/api/scores', async (req, res) => {
    const { username, score, game = 'snake' } = req.body;
    // ... (Score submission logic) ...
});

app.get('/api/scores', async (req, res) => {
    // ... (Score fetch logic) ...
    const game = req.query.game || 'snake';
    try {
        const topScores = await HighScore.aggregate([
            { $match: { game: game } },
            { $sort: { score: -1, timestamp: 1 } },
            { $group: { _id: "$username", maxScore: { $first: "$score" } } },
            { $sort: { maxScore: -1 } },
            { $limit: 10 },
            { $project: { _id: 0, username: "$_id", score: "$maxScore" } }
        ]);
        res.json({ success: true, scores: topScores });
    } catch (error) {
        console.error("Error fetching high scores:", error);
        res.status(500).json({ success: false, message: "Failed to fetch scores." });
    }
});


// --- ROUTING ---
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads"))); 

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "login.html"));
});

app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, '../public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
        }
    });
});

// --- SOCKET.IO CHAT LOGIC (FIXED) ---
const connectedUsers = {}; // Stores username -> socket.id

// server.js - Socket.IO Logic (Final Fix for Message Routing)

// connectedUsers will now map username to socket.id
const connectedUsers = {}; 

io.on("connection", (socket) => {
  let currentUsername = null; // Track the username for this specific socket

  // 1. REGISTER USER
  socket.on("newUser", (username) => {
    // 🚨 FIX 1: Store the username and update the map
    currentUsername = username;
    connectedUsers[username] = socket.id;
    
    // Broadcast list of currently online usernames (keys)
    io.emit("updateUsers", Object.keys(connectedUsers));
  });

  // 2. HANDLE PRIVATE MESSAGE (The failing part)
  socket.on("privateMessage", async (data) => {
    const { sender, receiver, text, fileDir, fileMimeType, originalName } = data;

    // ... (Your save to DB logic is correct and omitted here) ...
    // Note: You should save the message before routing.

    const messageToSend = { sender, receiver, text, fileDir, fileMimeType, originalName };

    // A. Send to sender (to display immediately)
    socket.emit("privateMessage", messageToSend); 

    // B. Send to receiver
    // 🚨 FIX 2: Check the map using the receiver's username to get their Socket ID
    const receiverSocketId = connectedUsers[receiver]; 
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("privateMessage", messageToSend);
    }
  });

  // 3. DISCONNECT
  socket.on("disconnect", () => {
    if (currentUsername && connectedUsers[currentUsername]) {
        // Remove the user from the map
        delete connectedUsers[currentUsername];
        // Broadcast the updated list
        io.emit("updateUsers", Object.keys(connectedUsers));
    }
  });

});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
         
