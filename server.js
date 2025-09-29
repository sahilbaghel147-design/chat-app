// server.js - Complete code with AI Chatbot Logic

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const compression = require("compression");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const dotenv = require('dotenv');

// Load environment variables from .env file (for MongoDB URI, etc.)
dotenv.config(); 

// -----------------------------------------------------
// 🚨 GEMINI AI SETUP (NEW)
// -----------------------------------------------------
const { GoogleGenAI } = require("@google/genai"); 
// IMPORTANT: Use environment variable for API Key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE"; 
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const model = "gemini-2.5-flash"; // Fast and capable model
// -----------------------------------------------------


const app = express();
const server = http.createServer(app);

// SOCKET.IO CONFIGURATION
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// EXPRESS SETTINGS & MIDDLEWARE
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));


// MONGODB CONNECTION
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully."))
  .catch(err => console.error("MongoDB connection error:", err));

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String },
  fileDir: { type: String },
  fileMimeType: { type: String },
  originalName: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);


// MULTER FILE UPLOAD CONFIGURATION
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Files will be stored in the 'public/uploads' folder
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/ /g, '_'));
  }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Max 10MB
}).single('chatFile');


// --- API AND AUTHENTICATION CONTROLS ---

// SIGNUP
app.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user) {
            return res.json({ success: false, message: "User already exists" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.json({ success: true, message: "User registered successfully" });

    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ success: false, message: "Server error during signup" });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: "Invalid username or password" });
        }

        res.json({ success: true, message: "Login successful" });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});


// FILE UPLOAD
app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error("Upload Error:", err);
            return res.status(500).json({ success: false, message: "File upload failed", error: err.message });
        }
        
        if (!req.file) {
             return res.status(400).json({ success: false, message: "No file selected for upload." });
        }

        // Send back file information
        res.json({ 
            success: true, 
            fileDir: '/uploads/' + req.file.filename,
            fileMimeType: req.file.mimetype,
            originalName: req.file.originalname 
        });
    });
});


// -----------------------------------------------------
// 🚨 AI CHAT ENDPOINT (NEW)
// -----------------------------------------------------
app.post('/api/chat/ai', async (req, res) => {
    const { username, message } = req.body;
    const AI_BOT_USERNAME = "Aura Bot 🤖"; // Match frontend name

    if (!message) {
        return res.status(400).json({ success: false, message: "Message is required." });
    }

    try {
        // Simple prompt to define the bot's persona
        const prompt = `You are a friendly and helpful chat assistant named '${AI_BOT_USERNAME}' in a social networking app. 
                        Keep your responses concise and engaging. The user is: ${username}. User's question: "${message}"`;

        const result = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });

        const aiResponse = result.text.trim();

        // Send the AI response back to the client
        res.json({ 
            success: true, 
            response: aiResponse,
            sender: AI_BOT_USERNAME // Bot's username
        });

    } catch (error) {
        console.error("Gemini AI Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Sorry, I am unable to process your request right now. Please try again later." 
        });
    }
});
// -----------------------------------------------------


// --- ROUTE TO SERVE HTML PAGES ---
app.get('/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    // Prevent directory traversal
    if (fileName.includes('..') || !fileName.endsWith('.html')) {
        return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
    }
    const filePath = path.join(__dirname, '../public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
        }
    });
});

// Route for root directory (serves index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- SOCKET.IO CHAT LOGIC ---
let onlineUsers = {}; // { socketId: username }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // New user joins/logs in
    socket.on('newUser', (username) => {
        onlineUsers[socket.id] = username;
        // Broadcast the updated user list to everyone
        io.emit('updateUsers', Object.values(onlineUsers));
        console.log(`User ${username} connected.`);
    });

    // Load Chat History
    socket.on('loadChat', async ({ sender, receiver }) => {
        try {
            const chats = await Message.find({
                $or: [
                    { sender: sender, receiver: receiver },
                    { sender: receiver, receiver: sender }
                ]
            }).sort({ timestamp: 1 });

            socket.emit('chatHistory', chats);
        } catch (err) {
            console.error("Error loading chat:", err);
        }
    });

    // Handle Private Message
    socket.on('privateMessage', async (msg) => {
        try {
            // Save message to DB
            const newMessage = new Message({
                sender: msg.sender,
                receiver: msg.receiver,
                text: msg.text,
                fileDir: msg.fileDir,
                fileMimeType: msg.fileMimeType,
                originalName: msg.originalName,
            });
            await newMessage.save();

            // Find receiver's socket ID(s)
            const receiverSocketIds = Object.keys(onlineUsers).filter(
                (socketId) => onlineUsers[socketId] === msg.receiver
            );

            // Emit message to sender and receiver
            socket.emit('privateMessage', newMessage);
            receiverSocketIds.forEach(id => io.to(id).emit('privateMessage', newMessage));

        } catch (err) {
            console.error("Error saving/sending message:", err);
        }
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        const username = onlineUsers[socket.id];
        delete onlineUsers[socket.id];
        // Broadcast the updated user list
        io.emit('updateUsers', Object.values(onlineUsers));
        console.log(`User ${username} disconnected. Socket ID: ${socket.id}`);
    });
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
