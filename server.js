// server.js

const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const path = require('path'); // 🔑 FIX: path module properly required
const multer = require('multer'); 

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// ===========================================
// === FILE UPLOAD CONFIGURATION (MULTER) ===
// ===========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Files saved to the public/uploads directory
        cb(null, 'public/uploads'); 
    },
    filename: (req, file, cb) => {
        // Unique filename: (timestamp)-(original filename)
        cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')); 
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|pdf|zip/;
        const mimeType = allowedTypes.test(file.mimetype);
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());

        if (mimeType && extName) {
            return cb(null, true);
        }
        cb(new Error('Only images, videos, pdfs, and zip files are allowed.'));
    }
}).single('chatFile'); 

app.post('/upload', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            const message = err.message || "File upload failed due to server error.";
            console.error('Upload Error:', err);
            return res.status(500).json({ success: false, message: message });
        }
        
        if (!req.file) {
             return res.status(400).json({ success: false, message: "No file selected." });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            fileUrl: fileUrl, 
            originalName: req.file.originalname, 
            mimeType: req.file.mimetype 
        });
    });
});

// ===========================================
// === EXISTING SETUP AND SOCKET LOGIC ===
// ===========================================

// Middleware to serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Serving uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); 

// Route for the root file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generic route for other HTML files (like /chat.html, /login.html)
app.get('/:file.html', (req, res) => {
    const fileName = req.params.file + '.html';
    const filePath = path.join(__dirname, 'public', fileName);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('404 File Not Found');
        }
    });
});


const users = {}; 

io.on('connection', (socket) => {
    socket.on('user-joined', (username) => {
        users[socket.id] = username;
        io.emit('online-users', users);
        socket.broadcast.emit('user-status', `${username} joined the chat.`);
    });
    
    // UPDATED: Handle file messages along with text
    socket.on('chat-message', (data) => {
        const sender = users[socket.id];
        if (sender) {
            io.emit('chat-message', {
                user: sender,
                text: data.text,
                fileUrl: data.fileUrl || null, 
                mimeType: data.mimeType || null,
                originalName: data.originalName || null
            });
        }
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            delete users[socket.id];
            io.emit('online-users', users);
            socket.broadcast.emit('user-status', `${username} left the chat.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
