// src/socketHandler.js
const Message = require('./models/Message');
const User = require('./models/User');

module.exports = function(io) {
  const onlineUsers = {}; // username -> socketId

  io.on('connection', (socket) => {
    console.log('Socket connected', socket.id);

    // registerUser from client
    socket.on('registerUser', (username) => {
      if (!username) return;
      onlineUsers[username] = socket.id;
      console.log('User online:', username);
      io.emit('updateUserList', Object.keys(onlineUsers));
    });

    // typing indicator
    socket.on('typing', ({ sender, receiver }) => {
      const sId = onlineUsers[receiver];
      if (sId) io.to(sId).emit('userTyping', sender);
    });

    // load chat history between two users
    socket.on('loadChat', async ({ user1, user2 }) => {
      try {
        if (!user1 || !user2) return;
        const history = await Message.find({
          $or: [
            { sender: user1, receiver: user2 },
            { sender: user2, receiver: user1 }
          ]
        }).sort({ timestamp: 1 });
        socket.emit('chatHistory', history);
      } catch (err) {
        console.error('loadChat error', err);
      }
    });

    // receive private message
    socket.on('privateMessage', async (msg) => {
      try {
        // msg: { sender, receiver, text, fileUrl, mimeType, originalName }
        const m = new Message({
          sender: msg.sender,
          receiver: msg.receiver,
          text: msg.text || "",
          fileUrl: msg.fileUrl || null,
          mimeType: msg.mimeType || null,
          originalName: msg.originalName || null
        });
        await m.save();

        // send to receiver if online
        const rId = onlineUsers[msg.receiver];
        if (rId) io.to(rId).emit('privateMessage', m);

        // also emit back to sender (so the sender's client gets stored message with timestamp)
        socket.emit('privateMessage', m);
      } catch (err) {
        console.error('privateMessage error', err);
      }
    });

    // message seen
    socket.on('messageSeen', async ({ sender, receiver }) => {
      try {
        await Message.updateMany({ sender, receiver, seen: false }, { seen: true });
      } catch (err) {
        console.error('messageSeen error', err);
      }
    });

    // handle disconnect
    socket.on('disconnect', async () => {
      let goneUser = null;
      for (const [u, id] of Object.entries(onlineUsers)) {
        if (id === socket.id) { goneUser = u; delete onlineUsers[u]; break; }
      }
      if (goneUser) {
        // update lastSeen
        try { await User.updateOne({ username: goneUser }, { lastSeen: new Date() }); } catch (e) {}
        io.emit('updateUserList', Object.keys(onlineUsers));
        console.log('User disconnected:', goneUser);
      }
    });
  });
};
