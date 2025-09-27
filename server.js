// server.js (FINAL ROBUST CODE: API + Socket + Static Serving)

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

// --- DATABASE CONNECTION (Improved Error Handling) ---
// Note: Render me MONGO_URI Environment Variable me set hona chahiye.
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB Connected Successfully"))
.catch(err => {
    // Agar DB connect nahi hota, toh hum sirf console me error denge,
    // lekin server ko chalte rehne denge (taki static files serve ho sake).
    console.error("❌ MongoDB Connection Error. API routes might fail:", err.message);
});

// --- MONGOOSE SCHEMAS (Defined here) ---
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


// --- HTTP API ROUTES ---

// Signup Route
app.post("/signup", async (req, res) => {
    // Check if MongoDB is connected before running DB logic
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "Server database connection unavailable. Try again later." });
    }
    // ... (rest of the signup logic)
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

// Login Route
app.post("/login", async (req, res) => {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: "Server database connection unavailable. Try again later." });
    }
    // ... (rest of the login logic)
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


// --- STATIC FILE SERVING AND ROUTES (Must come AFTER API routes) ---

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

// Root URL (/) ko seedha login.html par redirect karta hai
app.get("/", (req, res) => {
  res.redirect("/login.html"); 
});


// --- SOCKET.IO CHAT LOGIC ---

let onlineUsers = {}; 

io.on("connection", (socket) => {
  console.log("New user connected");

  // 1. New User Connects
  socket.on("newUser", (username) => { /* ... */ });

  // 2. Load Chat History
  socket.on("loadChat", async ({ user1, user2 }) => { /* ... */ });

  // 3. Handle Private Message
  socket.on("privateMessage", async ({ sender, receiver, text }) => { /* ... */ });

  // 4. User Disconnects
  socket.on("disconnect", () => { /* ... */ });
});


// --- SERVER LISTEN ---

// Render Environment PORT ka use karein.
const PORT = process.env.PORT || 4000; 
server.listen(PORT, () => console.log(`🚀 Final Merged Server running on port ${PORT}`));
