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

// FIX: Serving static files from the 'public' folder (Correct Path from root)
app.use(express.static(path.join(__dirname, "public")));


// --- MONGO DB CONNECTION ---
// 🚨 NOTE: Using your hardcoded Atlas URI (Replace with your ENV if needed)
const MONGO_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI, { 
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
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
  fileData: { type: String }, // For base64 encoding or file path
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
    // Correct path for uploads (from root)
    cb(null, path.join(__dirname, "public/uploads"));
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

// Sign Up API
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({ 
        username: username, 
        password: hashedPassword 
    });
    
    await newUser.save();
    
    res.json({ success: true, message: "User registered successfully." });

  } catch (error) {
    if (error.code === 11000) {
        return res.status(409).json({ success: false, message: "Username already exists." });
    }
    console.error("Signup error:", error);
    res.status(500).json({ success: false, message: "Server signup error. Check logs." });
  }
});

// Login API 
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

// --- ROUTING ---
// Allow access to uploaded files
app.use("/uploads", express.static(path.join(__dirname, "public/uploads"))); 

// FIX: Root path loads login.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Generic route for other HTML files (e.g., chat.html)
app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, 'public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            // Fallback for 404 or missing files
            res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
        }
    });
});

// --- SOCKET.IO CHAT LOGIC (Fully Fixed) ---
const connectedUsers = {}; // Stores { username: socket.id }

const emitOnlineUsers = () => {
    // FIX: Emit only the array of usernames (values of the object)
    io.emit("updateUsers", Object.keys(connectedUsers)); 
};

io.on("connection", (socket) => {
  let currentUsername = null;
  
  // 1. New User Connection
  socket.on("newUser", (username) => {
    if (!username) return;
    
    // Check if user is already connected (prevents duplicate entries)
    if (connectedUsers[username] && connectedUsers[username] !== socket.id) {
        // Disconnect the older instance
        io.sockets.sockets.get(connectedUsers[username])?.disconnect();
    }
    
    currentUsername = username;
    connectedUsers[username] = socket.id;
    console.log(`${username} connected. Total users: ${Object.keys(connectedUsers).length}`);
    emitOnlineUsers();
  });

  // 2. Load Chat History
  socket.on('loadChat', async ({ sender, receiver }) => {
    try {
        const history = await Message.find({
            $or: [
                { sender: sender, receiver: receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ timestamp: 1 });
        
        socket.emit('chatHistory', history);
    } catch (error) {
        console.error("Error loading chat history:", error);
    }
  });

  // 3. Receive Private Message
  socket.on("privateMessage", async (msg) => {
    if (!msg.receiver || !msg.sender) return;

    try {
        // Save message to MongoDB
        const newMessage = new Message(msg);
        await newMessage.save();

        // 1. Send to the sender (to confirm delivery)
        socket.emit("privateMessage", msg); 

        // 2. Send to the receiver if they are online
        const receiverSocketId = connectedUsers[msg.receiver];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("privateMessage", msg);
        }
    } catch (error) {
        console.error("Error handling private message:", error);
    }
  });


  // 4. User Disconnection
  socket.on("disconnect", () => {
    if (currentUsername) {
        // Remove user from the map
        delete connectedUsers[currentUsername];
        console.log(`${currentUsername} disconnected. Remaining users: ${Object.keys(connectedUsers).length}`);
        
        // Notify everyone of the updated list
        emitOnlineUsers();
    }
  });
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
