// server.js — FINAL with JWT, Signup, Forgot/Reset, Admin (inside /src)

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const compression = require("compression");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { v2: cloudinary } = require("cloudinary");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// -------------------- MIDDLEWARE --------------------
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static files at ../public (since this file is /src)
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// -------------------- MONGODB --------------------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// -------------------- CLOUDINARY --------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});
console.log("✅ Cloudinary Configured (env values)");

// -------------------- SCHEMAS --------------------
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true }, // hashed
  email: { type: String, required: false, trim: true, lowercase: true },
  bio: { type: String, default: "Hey there! I'm new to Aura Hub.", maxlength: 160 },
  profilePicture: { type: String, default: "uploads/default_avatar.jpg" },
  bestSnakeScore: { type: Number, default: 0 },
  // New fields for Phase 2
  isAdmin: { type: Boolean, default: false },
  followers: { type: [String], default: [] },
  xp: { type: Number, default: 0 },
  badges: { type: [String], default: [] },

  // password reset
  resetToken: { type: String },
  resetExpires: { type: Date },
});

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String },
  fileData: { type: String },
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

// -------------------- MULTER (LOCAL UPLOADS) --------------------
const uploadsDir = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single("chatfile");

// -------------------- EMAIL (nodemailer) --------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
  },
});

// Fallback logger if email not configured
transporter.verify((err, success) => {
  if (err) console.log("⚠️ Nodemailer verify failed (email not configured):", err.message || err);
  else console.log("✅ Nodemailer ready to send emails");
});

// -------------------- HELPERS --------------------
const signToken = (payload) => {
  const secret = process.env.JWT_SECRET || "verysecret_jwt_key_change_this";
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn });
};

const auth = (req, res, next) => {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ success: false, message: "Missing auth token" });
  const token = header.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Invalid auth token" });

  try {
    const secret = process.env.JWT_SECRET || "verysecret_jwt_key_change_this";
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // contains username, id, isAdmin (we sign these)
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (!req.user.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });
  next();
};

// -------------------- AUTH & USER ROUTES --------------------

// Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required" });

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ success: false, message: "Username already taken" });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const user = new User({ username, password: hash, email });
    // Optional: make first registered user an admin (only if you want)
    const userCount = await User.countDocuments();
    if (userCount === 0) user.isAdmin = true;

    await user.save();

    const token = signToken({ id: user._id, username: user.username, isAdmin: user.isAdmin });
    res.json({ success: true, message: "Signup successful", token, username: user.username });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Server error during signup" });
  }
});

// Login (returns JWT)
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, message: "Provide username and password" });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = signToken({ id: user._id, username: user.username, isAdmin: user.isAdmin });
    res.json({ success: true, message: "Login OK", token, username: user.username });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server login error" });
  }
});
// Forgot Password 🔑 
app.post("/api/reset-password", async (req, res) => {
  try {
    const { username, newPass } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false, message: "Username not found." });
    }

    const hashed = await bcrypt.hash(newPass, 10);
    user.password = hashed;
    await user.save();

    res.json({ success: true, message: "Password reset successful." });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ success: false, message: "Server error resetting password." });
  }
});
// Forgot password -> generate token, email link
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "No user with that email" });

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "verysecret_jwt_key_change_this", {
      expiresIn: Math.floor((process.env.RESET_TOKEN_EXPIRES || 3600000) / 1000), // seconds
    });

    user.resetToken = resetToken;
    user.resetExpires = Date.now() + (parseInt(process.env.RESET_TOKEN_EXPIRES || "3600000")); // ms
    await user.save();

    const resetLink = `${req.protocol}://${req.get("host")}/reset-password.html?token=${resetToken}&u=${encodeURIComponent(user.username)}`;

    const mailOptions = {
      from: process.env.EMAIL_USER || "no-reply@example.com",
      to: user.email,
      subject: "Password reset request",
      text: `You requested a password reset. Click here: ${resetLink} (or ignore this email)`,
      html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click to reset password</a></p>`,
    };

    // try send email; if fails, return token in response (for dev)
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.warn("Failed to send email:", err.message || err);
        // fallback: return reset link in response (only for dev; remove in prod)
        return res.json({ success: true, message: "Reset link generated (email failed)", resetLink });
      }
      return res.json({ success: true, message: "Reset link sent to email" });
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Error generating reset token" });
  }
});

// Reset password (uses token)
app.post("/api/reset-password", async (req, res) => {
  try {
    const { token, username, newPassword } = req.body || {};
    if (!token || !username || !newPassword) return res.status(400).json({ success: false, message: "Missing fields" });

    // verify token
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET || "verysecret_jwt_key_change_this");
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.resetToken || user.resetToken !== token) return res.status(400).json({ success: false, message: "Token mismatch" });
    if (user.resetExpires < Date.now()) return res.status(400).json({ success: false, message: "Token expired" });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    user.password = hash;
    user.resetToken = undefined;
    user.resetExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password has been reset" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Server error resetting password" });
  }
});

// -------------------- ADMIN ROUTES --------------------

// simple admin-only: list users
app.get("/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find({}, "-password -resetToken -resetExpires").lean();
    res.json({ success: true, users });
  } catch (err) {
    console.error("Admin users error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// promote user to admin (admin-only)
app.post("/admin/promote", auth, adminOnly, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ success: false, message: "Username required" });
    const u = await User.findOneAndUpdate({ username }, { $set: { isAdmin: true } }, { new: true });
    if (!u) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: `${username} is now admin` });
  } catch (err) {
    console.error("Promote error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------- EXISTING / PAGES / SOCKET.IO / ETC --------------------
// You can keep your previous routes and socket.io logic here — included a minimal socket below.

const page = (name) => (req, res) => res.sendFile(path.join(__dirname, "../public", `${name}.html`));

app.get("/", page("login"));
app.get("/chat", page("chat"));
app.get("/profile", page("profile"));
app.get("/games", page("games"));
app.get("/videos", page("videos"));
app.get("/about", page("about"));
app.get("/signup", page("signup"));
app.get("/client", page("client"));

app.use((req, res) => {
  const nf = path.join(__dirname, "../public/404.html");
  if (fs.existsSync(nf)) return res.status(404).sendFile(nf);
  res.status(404).send("Not Found");
}// --- SOCKET.IO CHAT LOGIC ---
const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("⚡ New client connected:", socket.id);

  // ✅ When a user logs in or connects
  socket.on("registerUser", (username) => {
    if (username) {
      connectedUsers[username] = socket.id;
      console.log(`✅ ${username} connected`);
      io.emit("updateUserList", Object.keys(connectedUsers)); // send updated list
    }
  });

  // ✅ When a private message is sent
  socket.on("privateMessage", async (msg) => {
    const { sender, receiver, text, fileUrl, mimeType, originalName } = msg;
    const newMsg = new Message({ sender, receiver, text, fileData: fileUrl, fileMimeType: mimeType, originalName });
    await newMsg.save();

    const receiverSocketId = connectedUsers[receiver];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("privateMessage", msg);
    }
    socket.emit("privateMessage", msg);
  });

  // ✅ When user requests previous chat
  socket.on("loadChat", async ({ user1, user2 }) => {
    const history = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });
    socket.emit("chatHistory", history);
  });

  // ✅ When a user disconnects
  socket.on("disconnect", () => {
    let disconnectedUser = null;
    for (let [user, id] of Object.entries(connectedUsers)) {
      if (id === socket.id) {
        disconnectedUser = user;
        delete connectedUsers[user];
        break;
      }
    }

    if (disconnectedUser) {
      console.log(`❌ ${disconnectedUser} disconnected`);
      io.emit("updateUserList", Object.keys(connectedUsers));
    }
  });
});



  // Message handling
  socket.on("privateMessage", ({ sender, receiver, message }) => {
    const receiverSocketId = connectedUsers[receiver];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receiveMessage", { sender, message });
    }
  });
});

// -------------------- START --------------------
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
