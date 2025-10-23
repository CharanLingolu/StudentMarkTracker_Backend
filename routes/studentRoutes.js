const express = require("express");
const router = express.Router();
const Student = require("./models/Student");
const authMiddleware = require("./auth");

// Create student marks (Teacher only)
router.post("/studentmarks", authMiddleware("teacher"), async (req, res) => {
  try {
    const { name, marks, subject } = req.body;
    const newStudent = new Student({
      name,
      marks,
      subject,
      teacherId: req.user.id,
    });
    await newStudent.save();
    res.status(201).json(newStudent);
  } catch {
    res.status(400).json({ message: "Invalid data" });
  }
});

// Get all student marks (admin sees all, teacher sees own)
router.get(
  "/studentmarks",
  authMiddleware(["admin", "teacher"]),
  async (req, res) => {
    try {
      let students;
      if (req.user.role === "admin") {
        students = await Student.find();
      } else {
        students = await Student.find({ teacherId: req.user.id });
      }
      res.json(students);
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Update student marks (teacher only)
router.put("/studentmarks/:id", authMiddleware("teacher"), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (student.teacherId.toString() !== req.user.id)
      return res.status(403).json({ message: "Unauthorized" });
    const updated = await Student.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updated);
  } catch {
    res.status(400).json({ message: "Invalid data" });
  }
});

// Delete student (teacher only)
router.delete(
  "/studentmarks/:id",
  authMiddleware("teacher"),
  async (req, res) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student)
        return res.status(404).json({ message: "Student not found" });
      if (student.teacherId.toString() !== req.user.id)
        return res.status(403).json({ message: "Unauthorized" });
      await Student.findByIdAndDelete(req.params.id);
      res.json({ message: "Student deleted" });
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
