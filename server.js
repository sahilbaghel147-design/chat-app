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
const io = socketIO(server);

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

// ✅ MongoDB Atlas connection
mongoose.connect(
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp",
  { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

// ✅ User Schema
const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model("User", UserSchema);

// ✅ Private Message Schema
const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// ✅ Signup Route
app.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.json({ success: true, message: "User registered successfully" });
  } catch (err) {
    res.json({ success: false, message: "Error in signup" });
  }
});

// ✅ Login Route
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.json({ success: false, message: "Invalid password" });

    res.json({ success: true, message: "Login successful", username });
  } catch (err) {
    res.json({ success: false, message: "Error in login" });
  }
});

// ✅ Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/client.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "client.html"));
});

// ✅ Online Users
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("newUser", (username) => {
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("updateUsers", Object.keys(onlineUsers));
  });

  // ✅ Load old chat between 2 users
  socket.on("loadChat", async ({ user1, user2 }) => {
    const chats = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });

    socket.emit("chatHistory", chats);
  });

  // ✅ Send private message
  socket.on("privateMessage", async ({ sender, receiver, text }) => {
    const newMessage = new Message({ sender, receiver, text });
    await newMessage.save();

    // Send to sender
    socket.emit("privateMessage", { sender, text });

    // Send to receiver if online
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("privateMessage", { sender, text });
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.username];
    io.emit("updateUsers", Object.keys(onlineUsers));
    console.log("User disconnected");
  });
});

// ✅ Start Server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
