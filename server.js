// server.js
const path = require('path');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const compression = require('compression');

dotenv.config();
const app = express();
const server = http.createServer(app);

// --- SOCKET.IO will be required after server created ---
const io = require('socket.io')(server, { cors: { origin: "*" } });

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve static public
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- DB connect ---
const FALLBACK_URI = "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp?retryWrites=true&w=majority";
const MONGO_URI = process.env.MONGO_URI || FALLBACK_URI;
mongoose.connect(MONGO_URI, { })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("MongoDB Connect Error:", err.message);
  });

// --- Models & Routes ---
const authRoutes = require('./src/routes/auth');
app.use('/api', authRoutes);

// default route -> login
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// any file.html in public
app.get('/:file.html', (req, res) => {
  const fileName = req.params.file + '.html';
  res.sendFile(path.join(__dirname, 'public', fileName), (err) => {
    if (err) res.status(404).send('Not Found');
  });
});

// --- socket handler (modular) ---
const socketHandler = require('./src/socketHandler');
socketHandler(io);

// --- start server ---
const PORT = process.env.PORT || process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
