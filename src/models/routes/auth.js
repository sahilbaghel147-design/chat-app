// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');

// signup
router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(!username || !password) return res.json({ success:false, message: 'Missing fields'});

    const exists = await User.findOne({ username });
    if (exists) return res.json({ success: false, message: 'Username already exists' });

    const hashed = await bcrypt.hash(password, 10);
    await new User({ username, password: hashed }).save();

    return res.json({ success: true, message: 'Signup success' });
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).json({ success:false, message: 'Server error' });
  }
});

// login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if(!username || !password) return res.json({ success:false, message: 'Missing fields'});

    const user = await User.findOne({ username });
    if (!user) return res.json({ success:false, message: 'User not found' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success:false, message: 'Invalid credentials' });

    // update lastSeen
    user.lastSeen = new Date();
    await user.save();

    return res.json({ success:true, username: user.username });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ success:false, message: 'Server error' });
  }
});

module.exports = router;
