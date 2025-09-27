// static-server.js (Updated to enforce login.html as the entry point)

const express = require("express");
const path = require("path");

const app = express();

// ✅ Serve public folder (HTML, CSS, JS, Videos)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    // Agar file .mp4 hai toh correct MIME type set karo
    if (filePath.endsWith(".mp4")) {
      res.setHeader("Content-Type", "video/mp4");
    }
  }
}));

// ✅ Updated: Root URL (/) ko seedha login.html par redirect karein
app.get("/", (req, res) => {
  // Isse turant browser ko /login.html par bhej diya jayega
  res.redirect("/login.html"); 
});

// ✅ Explicit route for index (agar koi /index.html khole)
app.get("/index.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Port (Render ke liye compatible)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Static Server running on port ${PORT}`);
});
