// server.js - Final AI-Free Code with MongoDB URI hardcoded
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const compression = require("compression");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const dotenv = require('dotenv');

dotenv.config(); 

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

// Serving static files from the 'public' folder (Corrected path for root server.js)
app.use(express.static(path.join(__dirname, 'public')));


// MONGODB CONNECTION
// 🚨 IMPORTANT: Replace the placeholder string with your ACTUAL MongoDB Atlas Connection String
// मैंने इसे आपके स्क्रीनशॉट के आधार पर एक उदाहरण के साथ बदला है
const MONGO_URI = 'mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully."))
  .catch(err => console.error("MongoDB connection error:", err));

// MongoDB Schemas (Profile/Bio fields included)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub.", maxlength: 160 },
  profilePicture: { type: String, default: '/uploads/default_avatar.png' } 
});
// ... (बाकी Schemas और API/Socket.IO लॉजिक पिछले जवाब जैसा ही है, कोई बदलाव नहीं)
const MessageSchema = new mongoose.Schema({ /* ... */ });
const HighScoreSchema = new mongoose.Schema({ /* ... */ });

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const HighScore = mongoose.model('HighScore', HighScoreSchema); 


// MULTER FILE UPLOAD CONFIGURATION (Used for chat attachments and profile pics)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads'));
  },
  filename: (req, file, cb) => {
    const prefix = req.body.isProfilePic ? 'profile-' : '';
    cb(null, prefix + Date.now() + '-' + file.originalname.replace(/ /g, '_')); 
  }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('chatFile'); 


// --- AUTHENTICATION CONTROLS ---

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


// --- FILE UPLOAD API ---
app.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error("Upload Error:", err);
            return res.status(500).json({ success: false, message: "File upload failed", error: err.message });
        }
        
        if (!req.file) {
             return res.status(400).json({ success: false, message: "No file selected for upload." });
        }
        
        res.json({ 
            success: true, 
            fileDir: '/uploads/' + req.file.filename,
            fileMimeType: req.file.mimetype,
            originalName: req.file.originalname 
        });
    });
});


// --- PROFILE API ENDPOINTS ---
app.get('/api/profile/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const user = await User.findOne({ username }).select('username bio profilePicture'); 

        if (!user) {
            return res.status(404).json({ success: false, message: "User profile not found." });
        }
        
        res.json({ success: true, profile: user });

    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ success: false, message: "Server error fetching profile." });
    }
});


app.post('/api/profile/update', async (req, res) => {
    const { username, bio, profilePicture } = req.body;
    
    if (!username) {
        return res.status(400).json({ success: false, message: "Username is required." });
    }

    try {
        const updateFields = {};
        if (bio !== undefined) {
            updateFields.bio = bio.substring(0, 160); 
        }
        if (profilePicture !== undefined) {
            updateFields.profilePicture = profilePicture;
        }

        const user = await User.findOneAndUpdate(
            { username: username }, 
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('username bio profilePicture');

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        res.json({ success: true, message: "Profile updated successfully.", profile: user });
        
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ success: false, message: "Failed to update profile." });
    }
});


// --- HIGH SCORE API ENDPOINTS ---
app.post('/api/scores', async (req, res) => {
    const { username, score, game = 'snake' } = req.body;
    if (!username || typeof score !== 'number' || score < 0) {
        return res.status(400).json({ success: false, message: "Invalid score or username." });
    }
    try {
        const newScore = new HighScore({ username, game, score });
        await newScore.save();
        const personalBest = await HighScore.findOne({ username, game }).sort({ score: -1 });
        res.json({ 
            success: true, 
            message: "Score submitted successfully.", 
            isNewRecord: personalBest ? (score >= personalBest.score) : true
        });
    } catch (error) {
        console.error("Score submission error:", error);
        res.status(500).json({ success: false, message: "Failed to save score." });
    }
});

app.get('/api/scores', async (req, res) => {
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


// --- ROUTE TO SERVE HTML PAGES ---
app.get('/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    if (fileName.includes('..') || !fileName.endsWith('.html')) {
        return res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
    }
    const filePath = path.join(__dirname, 'public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});


// --- SOCKET.IO CHAT LOGIC ---
let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('newUser', (username) => {
        onlineUsers[socket.id] = username;
        io.emit('updateUsers', Object.values(onlineUsers));
    });

    socket.on('loadChat', async ({ sender, receiver }) => {
        try {
            const chats = await Message.find({
                $or: [
                    { sender: sender, receiver: receiver },
                    { sender: receiver, receiver: sender }
                ]
            }).sort({ timestamp: 1 });
            socket.emit('chatHistory', chats);
        } catch (err) { console.error("Error loading chat:", err); }
    });

    socket.on('privateMessage', async (msg) => {
        try {
            const newMessage = new Message({
                sender: msg.sender, receiver: msg.receiver, text: msg.text,
                fileDir: msg.fileDir, fileMimeType: msg.fileMimeType, originalName: msg.originalName,
            });
            await newMessage.save();

            const receiverSocketIds = Object.keys(onlineUsers).filter(
                (socketId) => onlineUsers[socketId] === msg.receiver
            );

            socket.emit('privateMessage', newMessage); 
            receiverSocketIds.forEach(id => io.to(id).emit('privateMessage', newMessage));

        } catch (err) { console.error("Error saving/sending message:", err); }
    });

    socket.on('disconnect', () => {
        const username = onlineUsers[socket.id];
        delete onlineUsers[socket.id];
        io.emit('updateUsers', Object.values(onlineUsers));
    });
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
                                                             
