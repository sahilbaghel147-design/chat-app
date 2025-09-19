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
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: "sent" } // sent | delivered | seen
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

// ✅ Online Users + Last Seen
let onlineUsers = {};
let lastSeen = {};

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("newUser", (username) => {
    socket.username = username;
    onlineUsers[username] = socket.id;
    io.emit("updateUsers", { users: Object.keys(onlineUsers), lastSeen });
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

  // ✅ Typing indicator
  socket.on("typing", ({ sender, receiver }) => {
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("showTyping", { sender });
    }
  });

  // ✅ Private message
  socket.on("privateMessage", async ({ id, sender, receiver, text }) => {
    const newMessage = new Message({ sender, receiver, text, status: "sent" });
    await newMessage.save();

    // send to sender
    socket.emit("privateMessage", { id, sender, text, status: "sent" });

    // send to receiver if online
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("privateMessage", { id, sender, text, status: "delivered" });
      socket.emit("delivered", { id });
    }
  });

  // ✅ Seen message
  socket.on("seenMessage", async ({ id }) => {
    await Message.findByIdAndUpdate(id, { status: "seen" });
    socket.emit("seen", { id });
  });

  // ✅ Disconnect
  socket.on("disconnect", () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      lastSeen[socket.username] = new Date().toLocaleTimeString();
    }
    io.emit("updateUsers", { users: Object.keys(onlineUsers), lastSeen });
    console.log("User disconnected");
  });
});

// ✅ Start Server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    socket.emit("chatHistory", chats);
  });

  // ✅ Send private message
  socket.on("privateMessage", async ({ id, sender, receiver, text }) => {
    const newMessage = new Message({ id, sender, receiver, text, status: "sent" });
    await newMessage.save();

    // send to sender with "sent"
    socket.emit("privateMessage", { id, sender, text, status: "sent" });

    // send to receiver if online
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("privateMessage", { id, sender, text, status: "delivered" });

      // update db
      await Message.updateOne({ id }, { status: "delivered" });
      socket.emit("delivered", { id });
    }
  });

  // ✅ Seen message
  socket.on("seenMessage", async ({ id }) => {
    await Message.updateOne({ id }, { status: "seen" });
    io.emit("seen", { id });
  });

  // ✅ Typing indicator
  socket.on("typing", ({ sender, receiver }) => {
    if (onlineUsers[receiver]) {
      io.to(onlineUsers[receiver]).emit("showTyping", { sender });
    }
  });

  // ✅ Disconnect
  socket.on("disconnect", async () => {
    if (socket.username) {
      await User.updateOne({ username: socket.username }, { lastSeen: new Date() });
      delete onlineUsers[socket.username];
      io.emit("updateUsers", { users: Object.keys(onlineUsers) });
    }
    console.log("User disconnected");
  });
});

// ✅ Start Server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

