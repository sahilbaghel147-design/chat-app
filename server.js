// server.js (Final and Optimized Code)

// const dotenv = require('dotenv');
// dotenv.config();

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Socket.io configuration for CORS
const io = socketIO(server, {
    cors: {
        origin: "*", 
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
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// --- HTTP ROUTES ---
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

// Static files (serve HTML, CSS, etc.)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    }
  }
}));

// MAIN ROUTE: Users ko seedhe login page par bhejta hai.
app.get("/", (req, res) => res.redirect("/login.html")); 

// File serving routes:
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/games", (req, res) => res.sendFile(path.join(__dirname, "public", "games.html")));
app.get("/videos", (req, res) => res.sendFile(path.join(__dirname, "public", "videos.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "public", "about.html")));


// --- SOCKET.IO CHAT LOGIC ---

let onlineUsers = {}; 

io.on("connection", (socket) => {
  socket.on("newUser", (username) => {
    if (!username) return; 
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("userList", Object.keys(onlineUsers)); 
  });

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

  socket.on("disconnect", () => {
    if (socket.username && onlineUsers[socket.username]) {
        delete onlineUsers[socket.username];
        io.emit("userList", Object.keys(onlineUsers)); 
    } 
  });
});

// --- SERVER LISTEN ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
