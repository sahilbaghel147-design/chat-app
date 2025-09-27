// .env file se variables load karne ke liye zaroori (Agar aap .env use kar rahe hain)
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
// CORS ko handle karne ke liye socket.io options me lagaya gaya
const io = socketIO(server, {
    cors: {
        origin: "*", // Sabhi origins se allow karein (Production me specific URL dein)
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(bodyParser.json());
app.use(cors());

// ✅ MongoDB Connection (सुरक्षा के लिए Environment Variable का उपयोग करें)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => {
    console.error("❌ MongoDB Connection Error:", err.message);
    // Connection fail hone par server band karna accha practice hai
    process.exit(1); 
});

// ✅ User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);

// ✅ Message Schema
const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// --- ROUTES ---

// ✅ Signup Route (Validation aur Error Handling behtar kiya gaya)
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
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

// ✅ Login Route (Error Handling behtar kiya gaya)
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Simple Validation
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

// ✅ Static files (public folder serve karna)
app.use(express.static(path.join(__dirname, "public"), {
  // Video MIME type handling ko jaisa tha, waisa hi rakha gaya
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    }
  }
}));

// ✅ Custom Routes (Index se redirect aur specific file serving)
app.get("/", (req, res) => res.redirect("/login.html")); // Direct to login.html
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/games", (req, res) => res.sendFile(path.join(__dirname, "public", "games.html")));
app.get("/videos", (req, res) => res.sendFile(path.join(__dirname, "public", "videos.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "public", "about.html")));

// --- SOCKET.IO CHAT LOGIC ---

let onlineUsers = {}; // Map: username -> socket.id

io.on("connection", (socket) => {
  console.log("New user connected");

  // 1. New User Connects
  socket.on("newUser", (username) => {
    if (!username) return; // Basic check
    socket.username = username;
    onlineUsers[username] = socket.id;
    // Client-side me "updateUsers" ki jagah "userList" tha, jaisa ki client code me tha:
    io.emit("userList", Object.keys(onlineUsers)); 
  });

  // 2. Load Chat History (Error Handling added)
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
        console.error("Error loading chat history for:", user1, "and", user2, err);
        socket.emit("error", "Failed to load chat history.");
    }
  });

  // 3. Handle Private Message (Error Handling added)
  socket.on("privateMessage", async ({ sender, receiver, text }) => {
    if (!sender || !receiver || !text) return; // Basic data check
    try {
        const newMessage = new Message({ sender, receiver, text });
        await newMessage.save();
        
        // Sender ko message wapas bhejna
        socket.emit("privateMessage", { sender, text });

        // Receiver ko message bhejna agar online ho
        if (onlineUsers[receiver]) {
          io.to(onlineUsers[receiver]).emit("privateMessage", { sender, text });
        }
    } catch (err) {
        console.error("Error saving/sending private message:", err);
    }
  });

  // 4. User Disconnects (Stability improved)
  socket.on("disconnect", () => {
    // Check karein ki username set hai aur online list me hai
    if (socket.username && onlineUsers[socket.username]) {
        delete onlineUsers[socket.username];
        io.emit("userList", Object.keys(onlineUsers)); // Client-side name use kiya gaya
        console.log(`User ${socket.username} disconnected`);
    } else {
        console.log("A socket disconnected (username not tracked)");
    }
  });
});

// ✅ Port setup (Render/Hosting Service compatible)
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
