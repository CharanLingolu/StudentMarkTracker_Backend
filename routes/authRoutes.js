const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const authMiddleware = require("./auth");
require("dotenv").config();

// Register user (Admin only)
// Login user (all roles)
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Log incoming request details for debugging
    console.log("Login attempt:", { username, password });

    const user = await User.findOne({ username });
    if (!user) {
      console.log("User not found:", username);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Invalid password for user:", username);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Log the successful JWT token creation
    console.log("JWT token generated for user:", username);

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    // Log the error to identify what went wrong
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
