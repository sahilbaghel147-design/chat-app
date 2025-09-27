// server.js (Final API/Socket Code)

// Environment variables load karne ke liye zaroori (Agar aap .env file use kar rahe hain)
// const dotenv = require('dotenv');
// dotenv.config();

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
// const path = require("path"); // Static serving hatane ki wajah se path ki zaroorat nahi

const app = express();
const server = http.createServer(app);

// Socket.io configuration for CORS
const io = socketIO(server, {
    cors: {
        origin: "*", // Front-end URL yahan specify karein production me
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(bodyParser.json());
app.use(cors());

// --- DATABASE CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1); 
});

// --- MONGOOSE SCHEMAS ---

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// Message Schema
const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// --- HTTP API ROUTES (No Static File Serving/app.get() routes here) ---

// ✅ Signup Route
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || username.length < 3 || password.length < 6) {
        return res.status(400).json({ success: false, message: "Username (min 3) and Password (min 6) are required." });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    
    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: "Server error during signup." });
  }
});

// ✅ Login Route
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required." });
    }
    
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password" });

    res.json({ success: true, message: "Login successful", username });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
});


// --- SOCKET.IO CHAT LOGIC ---

let onlineUsers = {}; // Map: username -> socket.id

io.on("connection", (socket) => {
  console.log("New user connected");

  // 1. New User Connects
  socket.on("newUser", (username) => {
    if (!username) return; 
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("userList", Object.keys(onlineUsers)); 
  });

  // 2. Load Chat History
  socket.on("loadChat", async ({ user1, user2 }) => {
    try {
        const chats = await Message.find({
          $or: [
            { sender: user1, receiver: user2 },
            { sender: user2, receiver: user1 }
          ]
        }).sort({ timestamp: 1 });
        socket.emit("chatHistory", chats);
    } catch (err) {
        console.error("Error loading chat history:", err);
        socket.emit("error", "Failed to load chat history.");
    }
  });

  // 3. Handle Private Message
  socket.on("privateMessage", async ({ sender, receiver, text }) => {
    if (!sender || !receiver || !text) return; 
    try {
        const newMessage = new Message({ sender, receiver, text });
        await newMessage.save();
        
        socket.emit("privateMessage", { sender, text });

        if (onlineUsers[receiver]) {
          io.to(onlineUsers[receiver]).emit("privateMessage", { sender, text });
        }
    } catch (err) {
        console.error("Error saving/sending private message:", err);
    }
  });

  // 4. User Disconnects
  socket.on("disconnect", () => {
    if (socket.username && onlineUsers[socket.username]) {
        delete onlineUsers[socket.username];
        io.emit("userList", Object.keys(onlineUsers)); 
        console.log(`User ${socket.username} disconnected`);
    } 
  });
});

// --- SERVER LISTEN ---

// API/Socket Server is typically run on a different port than the static server (e.g., 4000)
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 API/Socket Server running on port ${PORT}`));
