// server.js (FINAL MERGED CODE: API + Socket + Static Serving)

// Environment variables load karne ke liye (Agar aap .env file use kar rahe hain)
const dotenv = require('dotenv');
dotenv.config();

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path"); // Ab iski zaroorat hai static serving ke liye

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
const UserSchema = new mongoose.Schema({ /* ... */ });
const User = mongoose.model("User", UserSchema);
const MessageSchema = new mongoose.Schema({ /* ... */ });
const Message = mongoose.model("Message", MessageSchema);


// --- HTTP API ROUTES ---

// ✅ Signup Route (Pehle jaisa)
app.post("/signup", async (req, res) => { /* ... signup logic ... */ });

// ✅ Login Route (Pehle jaisa)
app.post("/login", async (req, res) => { /* ... login logic ... */ });


// ************************************************************
// ** STATIC FILE SERVING AND ROUTE HANDLERS (Static-Server se merge kiya gaya) **
// ************************************************************

// ✅ Serve public folder (HTML, CSS, JS, Videos)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    }
  }
}));

// ✅ GUARANTEED LOGIN REDIRECT: Root URL (/) ko seedha login.html par bhejta hai
app.get("/", (req, res) => {
  res.redirect("/login.html"); 
});

// ✅ Explicit routes (agar koi seedha file kholna chahe)
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/games", (req, res) => res.sendFile(path.join(__dirname, "public", "games.html")));
app.get("/videos", (req, res) => res.sendFile(path.join(__dirname, "public", "videos.html")));
app.get("/about", (req, res) => res.sendFile(path.join(__dirname, "public", "about.html")));


// --- SOCKET.IO CHAT LOGIC ---
let onlineUsers = {}; 

io.on("connection", (socket) => {
  /* ... (Pura Socket.io logic jaisa pehle tha) ... */
});


// --- SERVER LISTEN ---

// ✅ Render Environment PORT ka use karein
const PORT = process.env.PORT || 4000; 
server.listen(PORT, () => console.log(`🚀 Final Merged Server running on port ${PORT}`));
