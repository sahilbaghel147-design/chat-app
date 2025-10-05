// src/models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  text: { type: String, default: "" },
  fileUrl: { type: String, default: null },
  mimeType: { type: String, default: null },
  originalName: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false }
});

module.exports = mongoose.model('Message', MessageSchema);
