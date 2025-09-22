const mongoose = require("mongoose");

mongoose.connect(
  "mongodb+srv://sahil:12345@cluster0.5mdojw9.mongodb.net/chatapp",
  { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

const MessageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  text: String,
  timestamp: Date
});
const Message = mongoose.model("Message", MessageSchema);

async function showVoiceMessages() {
  const voices = await Message.find({ text: { $regex: "<audio" } });
  console.log("🎤 Voice Messages:", voices);
  mongoose.disconnect();
}

showVoiceMessages();
