const express = require("express");
const path = require("path");

const app = express();

// ✅ Serve public folder (HTML, CSS, JS, Videos)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    // agar file .mp4 hai toh correct MIME type set karo
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    }
  }
}));

// ✅ Default route -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Port (Render ke liye compatible)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Static Server running on port ${PORT}`);
});
