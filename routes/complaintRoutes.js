const express = require("express");
const router = express.Router();
const Complaint = require("../models/Complaint");
const authMiddleware = require("../middleware/authMiddleware");

// Raise complaint (student only)
router.post("/complaints", authMiddleware("student"), async (req, res) => {
  try {
    const { message } = req.body;
    const complaint = new Complaint({
      studentId: req.user.id,
      studentName: req.user.username,
      message,
    });
    await complaint.save();
    res.status(201).json(complaint);
  } catch {
    res.status(400).json({ message: "Invalid data" });
  }
});

// Get complaints (student own, admin/teacher all)
router.get(
  "/complaints",
  authMiddleware(["admin", "teacher", "student"]),
  async (req, res) => {
    try {
      let complaints;
      if (req.user.role === "student") {
        complaints = await Complaint.find({ studentId: req.user.id });
      } else {
        complaints = await Complaint.find();
      }
      res.json(complaints);
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Resolve complaint (teacher/admin)
router.put(
  "/complaints/:id",
  authMiddleware(["teacher", "admin"]),
  async (req, res) => {
    try {
      const complaint = await Complaint.findById(req.params.id);
      if (!complaint) return res.status(404).json({ message: "Not found" });
      complaint.status = "Resolved";
      await complaint.save();
      res.json(complaint);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  }
);

module.exports = router;
