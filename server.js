// server.js (WITH USER STATUS LOGIC)

const dotenv = require('dotenv');
dotenv.config();

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

// Socket.io configuration
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
    console.error("❌ MongoDB Connection Error. API routes might fail:", err.message);
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


// --- HTTP API ROUTES (Unchanged) ---
// ... (Your /signup and /login routes are here) ...

app.post("/signup", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "Server database connection unavailable. Try again later." });
    }
    try {
        const { username, password } = req.body;
        if (!username || !password || username.length < 3 || password.length < 6) {
            return res.status(400).json({ success: false, message: "Username (min 3) and Password (min 6) are required." });
        }
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(409).json({ success: false, message: "User already exists" });
        
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
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "Server database connection unavailable. Try again later." });
    }
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


// --- STATIC FILE SERVING AND ROUTES ---
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.redirect("/login.html"); 
});


// --- SOCKET.IO CHAT LOGIC (STATUS ADDED) ---

// onlineUsers will now store status: { 'sahil': { id: 'socketid123', status: 'Active' } }
let onlineUsers = {}; 

// Helper function to broadcast the current list and status of users
const broadcastUserList = () => {
    const userList = Object.keys(onlineUsers).map(username => ({
        username: username,
        status: onlineUsers[username].status // <-- NEW: Send status
    }));
    io.emit("userList", userList);
};


io.on("connection", (socket) => {
    console.log("New user connected");

    // 1. New User Connects (MODIFIED)
    socket.on("newUser", (username) => {
        // If user logs in from multiple tabs, keep one entry and update socket id
        onlineUsers[username] = { id: socket.id, status: 'Active' };
        socket.username = username; 
        broadcastUserList(); // Broadcast the updated list with status
    });

    // 2. Load Chat History (UNCHANGED)
    socket.on("loadChat", async ({ user1, user2 }) => { 
        if (mongoose.connection.readyState !== 1) return; // Skip if DB is down
        try {
            const messages = await Message.find({
                $or: [
                    { sender: user1, receiver: user2 },
                    { sender: user2, receiver: user1 }
                ]
            }).sort('timestamp');
            socket.emit("chatHistory", messages);
        } catch (err) {
            console.error("Error loading chat history:", err);
        }
    });

    // 3. Handle Private Message (UNCHANGED)
    socket.on("privateMessage", async ({ sender, receiver, text }) => {
        if (mongoose.connection.readyState !== 1) return; // Skip if DB is down

        const newMessage = new Message({ sender, receiver, text });
        await newMessage.save();

        // Send to self and receiver
        socket.emit("message", newMessage); // To sender
        
        const receiverSocketId = onlineUsers[receiver] ? onlineUsers[receiver].id : null;
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("message", newMessage); // To receiver
        }
    });

    // --- 🔑 NEW FEATURE: User Status Change Handler ---
    socket.on("userStatusChange", (newStatus) => {
        const username = socket.username;
        if (username && onlineUsers[username]) {
            onlineUsers[username].status = newStatus;
            broadcastUserList(); // Send the updated list to all users
            console.log(`${username} status changed to ${newStatus}`);
        }
    });
    
    // 4. User Disconnects (MODIFIED)
    socket.on("disconnect", () => {
        console.log("User disconnected");
        const username = socket.username;
        // Remove the user from the online list when their only active socket disconnects
        if (username && onlineUsers[username] && onlineUsers[username].id === socket.id) {
            delete onlineUsers[username];
            broadcastUserList(); 
        }
    });
});


// --- SERVER LISTEN ---
const PORT = process.env.PORT || 4000; 
server.listen(PORT, () => console.log(`🚀 Final Merged Server running on port ${PORT}`));
