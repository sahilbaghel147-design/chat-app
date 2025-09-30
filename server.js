const path = require("path");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const compression = require("compression"); // <-- compression added

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// --- SETTINGS & MIDDLEWARE ---
app.use(compression()); // <-- compression used
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// --- MONGO DB CONNECTION ---
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/chatapp", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// --- MONGOOSE SCHEMAS ---

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub." },
  profilePicture: { type: String, default: "uploads/default_avatar.jpg" },
  bestSnakeScore: { type: Number, default: 0 },
});

// Message Schema
const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String },
  // File fields for uploads
  fileData: { type: String }, // Stored file path
  fileMimeType: { type: String },
  originalName: { type: String }, // Fix: No unnecessary nested type here
  timestamp: { type: Date, default: Date.now },
});

// HighScore Schema
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
    // Correct Path: Files will be stored in the public/uploads folder
    cb(null, path.join(__dirname, "../public/uploads"));
  },
  filename: (req, file, cb) => {
    // Correct Filename generation
    const ext = path.extname(file.originalname);
    const filename = Date.now() + "-" + file.originalname.replace(/ /g, "_");
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
}).single("chatfile");

// --- API AND AUTHENTICATION ROUTES ---

// Signup
app.post("/api/signup", async (req, res) => {
  const { username, password } = req.body;
  if (await User.findOne({ username })) {
    return res.json({ success: false, message: "User already exists!" });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();

  res.json({ success: true, message: "Signup successful. Please log in." });
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.json({ success: false, message: "Invalid username or password." });
  }

  // Login successful
  res.json({ success: true, message: "Login successful.", username: user.username });
});

// Get Profile Data
app.get("/api/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching profile." });
  }
});

// Update Profile
app.post("/api/profile/update", async (req, res) => {
  const { username, bio, bestSnakeScore } = req.body;

  try {
    const updateFields = {};
    if (bio !== undefined) updateFields.bio = bio;
    if (bestSnakeScore !== undefined) updateFields.bestSnakeScore = bestSnakeScore;

    const updatedUser = await User.findOneAndUpdate(
      { username },
      { $set: updateFields },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, message: "Profile updated successfully.", user: updatedUser });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ success: false, message: "Internal server error during update." });
  }
});

// Update Profile Picture
app.post("/api/profile/upload", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }

    const username = req.body.username;
    if (!username) {
      // If username is missing, delete the uploaded file
      if (req.file) {
        // You should add file deletion logic here if needed
      }
      return res.status(400).json({ success: false, message: "Username is missing." });
    }

    const filePath = req.file.path.replace(/\\/g, "/").split("public/")[1];

    try {
      const updatedUser = await User.findOneAndUpdate(
        { username },
        { profilePicture: filePath },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      res.json({ success: true, message: "Profile picture updated.", profilePicture: filePath });
    } catch (error) {
      res.status(500).json({ success: false, message: "Error saving profile picture." });
    }
  });
});

// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}).select("username profilePicture");
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching users." });
  }
});

// Get chat history
app.get("/api/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    }).sort("timestamp");
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching messages." });
  }
});

// --- SOCKET.IO CHAT LOGIC ---
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("register", (username) => {
    connectedUsers[username] = socket.id;
    io.emit("user_online", Object.keys(connectedUsers));
    console.log(`${username} registered with ID ${socket.id}`);
  });

  // Handle private message and file upload
  socket.on("private_message", async (msg) => {
    try {
      // Save message to database
      const newMessage = new Message({
        sender: msg.sender,
        receiver: msg.receiver,
        text: msg.text,
        fileData: msg.fileData,
        fileMimeType: msg.fileMimeType,
        originalName: msg.originalName,
      });
      await newMessage.save();

      // Send to receiver
      const receiverSocketId = connectedUsers[msg.receiver];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("new_private_message", msg);
      }
      // Send back to sender
      io.to(socket.id).emit("new_private_message", msg);
    } catch (error) {
      console.error("Error saving or sending message:", error);
    }
  });

  socket.on("disconnect", () => {
    for (const username in connectedUsers) {
      if (connectedUsers[username] === socket.id) {
        delete connectedUsers[username];
        io.emit("user_offline", Object.keys(connectedUsers));
        console.log(`${username} disconnected.`);
        break;
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
