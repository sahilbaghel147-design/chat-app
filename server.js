// --- REQUIRES & SETUP ---
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

// Serving static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));


// MONGODB CONNECTION
// 🚨 NOTE: Using your hardcoded Atlas URI as requested.
const MONGO_URI = 'mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully."))
  .catch(err => console.error("MongoDB connection error:", err));

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub.", maxlength: 160 },
  profilePicture: { type: String, default: '/uploads/default_avatar.png' },
  // FIX: Added bestSnakeScore field to UserSchema for quick retrieval on profile
  bestSnakeScore: { type: Number, default: 0 } 
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

const HighScoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    game: { type: String, required: true, default: 'snake' }, 
    score: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
});


const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const HighScore = mongoose.model('HighScore', HighScoreSchema); 


// MULTER FILE UPLOAD CONFIGURATION (Used for chat attachments and profile pics)
const UPLOADS_DIR = path.join(__dirname, 'public/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);

    let filename;
    if (req.body.isProfilePic === 'true' && req.body.username) {
        // Filename for profile picture: username_profile.ext (overwrites previous)
        filename = `${req.body.username}_profile${ext}`; 
    } else {
        // Filename for chat attachment
        filename = `${uniquePrefix}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    }
    cb(null, filename);
  }
});

// The middleware is named 'uploadMiddleware' to be used in the POST /upload route
const uploadMiddleware = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('chatFile'); 


// --- AUTHENTICATION AND API CONTROLS ---

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


// Route to handle file uploads
app.post('/upload', (req, res) => {
    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error("Upload Error:", err);
            return res.status(500).json({ success: false, message: "File upload failed", error: err.message });
        }
        
        if (!req.file) {
             return res.status(400).json({ success: false, message: "No file selected for upload." });
        }
        
        const fileDir = '/uploads/' + req.file.filename;

        // FIX: Handle profile picture update in this route
        if (req.body.isProfilePic === 'true' && req.body.username) {
            try {
                await User.updateOne({ username: req.body.username }, { $set: { profilePicture: fileDir } });
                return res.json({ 
                    success: true, 
                    message: "Profile picture updated.", 
                    fileDir: fileDir 
                });
            } catch (dbErr) {
                console.error("DB update error:", dbErr);
                return res.status(500).json({ success: false, message: "Database error during DP update." });
            }
        }
        
        // Response for chat file upload
        res.json({ 
            success: true, 
            fileDir: fileDir, // Path for frontend
            fileMimeType: req.file.mimetype,
            originalName: req.file.originalname 
        });
    });
});

// Route to fetch profile data (FIXED error handling and fetching best score from UserSchema)
app.get('/api/profile/:username', async (req, res) => {
    try {
        const username = req.params.username;
        // Fetch score directly from UserSchema (updated via High Score API)
        const user = await User.findOne({ username }).select('username bio profilePicture bestSnakeScore'); 

        if (!user) {
            return res.status(404).json({ success: false, message: "User profile not found." });
        }
        
        res.json({ 
            success: true, 
            profile: {
                username: user.username,
                bio: user.bio,
                profilePicture: user.profilePicture,
                bestSnakeScore: user.bestSnakeScore || 0 
            }
        });

    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ success: false, message: "Server error fetching profile." });
    }
});

// Route to update profile (Bio and Picture)
app.post('/api/profile/update', async (req, res) => {
    const { username, bio, profilePicture } = req.body;
    
    if (!username) {
        return res.status(400).json({ success: false, message: "Username is required." });
    }

    try {
        const updateFields = {};
        if (bio !== undefined) {
            updateFields.bio = bio ? bio.substring(0, 160) : ''; 
        }
        if (profilePicture !== undefined) {
            updateFields.profilePicture = profilePicture;
        }

        const user = await User.findOneAndUpdate(
            { username: username }, 
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('username bio profilePicture bestSnakeScore'); // Select score to return

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        res.json({ 
            success: true, 
            message: "Profile updated successfully.", 
            profile: {
                username: user.username,
                bio: user.bio,
                profilePicture: user.profilePicture,
                bestSnakeScore: user.bestSnakeScore || 0 
            }
        });
        
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ success: false, message: "Failed to update profile." });
    }
});

// High Score API
app.post('/api/scores', async (req, res) => {
    const { username, score, game = 'snake' } = req.body;
    if (!username || typeof score !== 'number' || score < 0) {
        return res.status(400).json({ success: false, message: "Invalid score or username." });
    }
    try {
        // 1. Update/Insert into HighScore collection
        const highscoreEntry = await HighScore.findOneAndUpdate(
            { username, game },
            { 
                $max: { score: score },
                $set: { timestamp: Date.now() }
            },
            { new: true, upsert: true }
        );
        
        // 2. FIX: Update the bestSnakeScore field in the User document as well
        await User.updateOne({ username }, { $max: { bestSnakeScore: score } });

        res.json({ 
            success: true, 
            message: "Score submitted successfully.", 
            isNewRecord: highscoreEntry.score === score
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


// --- SOCKET.IO CHAT LOGIC (UPDATED FOR PROFILE PICTURES) ---
let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('newUser', (username) => {
        onlineUsers[socket.id] = username;
        io.emit('updateUsers', Object.values(onlineUsers));
    });

    // Fetches chat history and attaches profile pictures
    socket.on('loadChat', async ({ sender, receiver }) => {
        try {
            const chats = await Message.find({
                $or: [
                    { sender: sender, receiver: receiver },
                    { sender: receiver, receiver: sender }
                ]
            }).sort({ timestamp: 1 });
            
            // 1. Fetch all unique senders' profile pictures
            const uniqueSenders = [...new Set(chats.map(msg => msg.sender))];
            const senderProfiles = await User.find({ username: { $in: uniqueSenders } })
                .select('username profilePicture');

            const profileMap = senderProfiles.reduce((map, user) => {
                map[user.username] = user.profilePicture;
                return map;
            }, {});

            // 2. Attach profile picture URL to each message
            const chatsWithProfiles = chats.map(msg => ({
                ...msg.toObject(),
                senderPicture: profileMap[msg.sender] || '/uploads/default_avatar.png'
            }));

            socket.emit('chatHistory', chatsWithProfiles);
        } catch (err) { console.error("Error loading chat:", err); }
    });

    // Sends new private message and attaches sender's profile picture
    socket.on('privateMessage', async (msg) => {
        try {
            // 1. Save the new message
            const newMessage = new Message({
                sender: msg.sender, receiver: msg.receiver, text: msg.text,
                fileDir: msg.fileDir, fileMimeType: msg.fileMimeType, originalName: msg.originalName,
            });
            await newMessage.save();

            // 2. Fetch sender's profile picture
            const senderUser = await User.findOne({ username: msg.sender })
                .select('profilePicture');
            
            const senderPicture = senderUser ? senderUser.profilePicture : '/uploads/default_avatar.png';

            // 3. Prepare message object to send to client
            const messageToSend = {
                ...newMessage.toObject(),
                senderPicture: senderPicture
            };

            const receiverSocketIds = Object.keys(onlineUsers).filter(
                (socketId) => onlineUsers[socketId] === msg.receiver
            );

            // 4. Send the enriched message to both sender and receiver
            socket.emit('privateMessage', messageToSend); 
            receiverSocketIds.forEach(id => io.to(id).emit('privateMessage', messageToSend));

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
         
