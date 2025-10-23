// server.js (or index.js in your backend directory)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;
const DB_URL =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/studentmarktracker";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-123";

// Connect to MongoDB
mongoose
  .connect(DB_URL)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Middleware
app.use(cors());
app.use(express.json());

// Option 2 (Recommended for allowing credentials across all origins):
const corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
};

// Middleware
app.use(cors(corsOptions)); // Apply the simplified CORS options
app.use(express.json());

// --- Schemas and Models ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true }, // Login ID
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  fullName: { type: String, trim: true, default: "" }, // For display name
  rollNumber: { type: String, trim: true, unique: true, sparse: true }, // Unique ID for marks linkage
});
const User = mongoose.model("User", userSchema);

// CORRECTED STUDENT SCHEMA: Allows multiple subjects via compound index
const studentSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, trim: true }, // Not unique alone
    studentName: { type: String, required: true, trim: true },
    marks: { type: Number, required: true, min: 0, max: 100 },
    subject: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ADDED COMPOUND UNIQUE INDEX: rollNumber + subject must be unique
studentSchema.index({ rollNumber: 1, subject: 1 }, { unique: true });

const Student = mongoose.model("Student", studentSchema);

// DEVELOPMENT FIX: Drop existing indexes to apply the new compound index cleanly
Student.collection.dropIndexes(function (err, result) {
  if (err) {
    if (
      err.codeName !== "IndexNotFound" &&
      err.message.includes("index not found")
    ) {
      console.error("Error dropping old Student indexes:", err);
    }
  } else {
    console.log("Successfully cleared old Student indexes for schema reset.");
  }
});

const complaintSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  studentName: { type: String },
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ["Submitted", "Resolved"],
    default: "Submitted",
  },
  createdAt: { type: Date, default: Date.now },
});
const Complaint = mongoose.model("Complaint", complaintSchema);

// --- Authentication Middleware ---
const authMiddleware = (roles = []) => {
  if (typeof roles === "string") roles = [roles];
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).json({ message: "Authentication required" });
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(decoded.role)) {
        return res
          .status(403)
          .json({ message: "Forbidden: insufficient rights" });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};

// --- Routes ---

// 1. Admin: Register User
app.post("/api/users", authMiddleware("admin"), async (req, res) => {
  try {
    const { username, password, role, fullName, rollNumber } = req.body;

    if (await User.findOne({ username })) {
      return res.status(400).json({ message: "Username already exists." });
    }

    if (rollNumber && (await User.findOne({ rollNumber }))) {
      return res.status(400).json({ message: "Roll Number already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashed,
      role,
      fullName,
      rollNumber,
    });
    await newUser.save();

    res.status(201).json({
      message: "User created successfully",
      id: newUser._id,
      username: newUser.username,
      role: newUser.role,
    });
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to create user." });
  }
});

// 2. Auth: Login User
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        username: user.username,
        fullName: user.fullName,
        rollNumber: user.rollNumber,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({
      token,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      rollNumber: user.rollNumber,
    });
  } catch (err) {
    console.error("Error details:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// 3. Admin: Get all users
app.get("/api/users", authMiddleware("admin"), async (req, res) => {
  try {
    // MODIFIED: Fetches all fields including the HASHED password for Admin transparency
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// 4. Admin: Delete User
app.delete("/api/users/:id", authMiddleware("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id === userId) {
      return res.status(403).json({ message: "Cannot delete yourself." });
    }
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found." });
    }
    res.status(200).json({ message: "User deleted successfully." });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// 6. Admin: Update User Details (Role, Name, Roll Number)
app.put("/api/users/:id", authMiddleware("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    const { role, fullName, rollNumber } = req.body;

    const updateFields = {};
    if (role) updateFields.role = role;
    if (fullName) updateFields.fullName = fullName;
    if (rollNumber) updateFields.rollNumber = rollNumber;

    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ message: "User updated successfully", user: updatedUser });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        message: "That Roll Number is already assigned to another user.",
      });
    }
    res.status(500).json({ message: "Server Error during update." });
  }
});

// 7. Admin: Update User Password
app.put(
  "/api/users/password/:id",
  authMiddleware("admin"),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res
          .status(400)
          .json({ message: "Password must be at least 6 characters long." });
      }

      const hashed = await bcrypt.hash(newPassword, 10);

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { password: hashed },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found." });
      }

      res.json({ message: "Password updated successfully." });
    } catch (err) {
      console.error("Error updating password:", err);
      res.status(500).json({ message: "Server Error during password update." });
    }
  }
);

// 5. GET Student Marks (Read Operation with search)
app.get(
  "/api/studentmarks",
  authMiddleware(["admin", "teacher", "student"]),
  async (req, res) => {
    try {
      const { search } = req.query; // Get search term
      const userId = req.user.id;
      const rollNumber = req.user.rollNumber;

      let searchFilter = {};
      if (search) {
        const regex = new RegExp(search, "i");
        searchFilter = {
          $or: [
            { rollNumber: { $regex: regex } },
            { studentName: { $regex: regex } },
            { subject: { $regex: regex } },
          ],
        };
      }

      let students;

      if (req.user.role === "admin" || req.user.role === "teacher") {
        const ownershipFilter =
          req.user.role === "admin"
            ? {}
            : { teacherId: new mongoose.Types.ObjectId(userId) };
        const finalMatchFilter = { ...ownershipFilter, ...searchFilter }; // Combine filters

        // Aggregate to join mark records with student names
        students = await Student.aggregate([
          { $match: finalMatchFilter }, // APPLY COMBINED FILTER
          {
            $lookup: {
              from: "users",
              localField: "rollNumber",
              foreignField: "rollNumber",
              as: "studentInfo",
            },
          },
          {
            $unwind: { path: "$studentInfo", preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              _id: 1,
              rollNumber: 1,
              marks: 1,
              subject: 1,
              teacherId: 1,
              studentName: "$studentInfo.fullName",
            },
          },
        ]);
      } else if (req.user.role === "student") {
        // Student sees their marks + search filter
        students = await Student.find({
          rollNumber: rollNumber,
          ...searchFilter,
        });
      }

      res.json(students);
    } catch (err) {
      console.error("Error fetching student marks:", err);
      res.status(500).json({ message: "Server Error" });
    }
  }
);

// Student mark routes (POST - Teacher Create)
app.post("/api/studentmarks", authMiddleware("teacher"), async (req, res) => {
  try {
    const { rollNumber, marks, subject } = req.body;

    const studentUser = await User.findOne({ rollNumber, role: "student" });
    if (!studentUser) {
      return res
        .status(404)
        .json({ message: "Student with this Roll Number does not exist." });
    }

    const newStudent = new Student({
      rollNumber,
      studentName: studentUser.fullName, // Store the full name
      marks,
      subject,
      teacherId: req.user.id,
    });
    await newStudent.save();
    res.status(201).json(newStudent);
  } catch (err) {
    console.error("Error saving mark:", err);
    if (err.code === 11000) {
      return res.status(400).json({
        message: `Mark record already exists for Roll Number ${req.body.rollNumber} in ${req.body.subject}. Please use Edit Mark to update.`,
      });
    }
    res
      .status(400)
      .json({ message: err.message || "Invalid data or Roll Number error." });
  }
});

app.put(
  "/api/studentmarks/:id",
  authMiddleware("teacher"),
  async (req, res) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student)
        return res.status(404).json({ message: "Student not found" });
      if (student.teacherId.toString() !== req.user.id)
        return res.status(403).json({ message: "Not authorized to update" });

      const updated = await Student.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
      res.json(updated);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  }
);

app.delete(
  "/api/studentmarks/:id",
  authMiddleware("teacher"),
  async (req, res) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student)
        return res.status(404).json({ message: "Student not found" });
      if (student.teacherId.toString() !== req.user.id)
        return res.status(403).json({ message: "Not authorized to delete" });
      await Student.findByIdAndDelete(req.params.id);
      res.json({ message: "Student deleted" });
    } catch {
      res.status(500).json({ message: "Server Error" });
    }
  }
);

// Complaint routes (all correctly authorized)

app.post("/api/complaints", authMiddleware("student"), async (req, res) => {
  try {
    const { message } = req.body;
    const user = await User.findById(req.user.id);
    const complaint = new Complaint({
      studentId: req.user.id,
      studentName: user.fullName || req.user.username,
      message,
    });
    await complaint.save();
    res.status(201).json(complaint);
  } catch (err) {
    console.error("Error submitting complaint:", err);
    res.status(400).json({ message: "Invalid data" });
  }
});

app.get(
  "/api/complaints",
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
      res.status(500).json({ message: "Server Error" });
    }
  }
);

app.put(
  "/api/complaints/:id",
  authMiddleware(["teacher", "admin"]),
  async (req, res) => {
    try {
      const complaint = await Complaint.findById(req.params.id);
      if (!complaint)
        return res.status(404).json({ message: "Complaint not found" });
      complaint.status = "Resolved";
      await complaint.save();
      res.json(complaint);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  }
);

// Route to register admin without authentication (optional)
app.post("/api/registerAdmin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await new User({ username, password: hashed, role: "admin" }).save();
    res.status(201).json({ message: "Admin user created" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// UTILITY ROUTE: Register Test Student
app.post("/api/registerTestStudent", async (req, res) => {
  try {
    const { username, password, fullName, rollNumber } = req.body;

    if (await User.findOne({ username })) {
      return res.status(400).json({ message: "User already exists." });
    }

    if (rollNumber && (await User.findOne({ rollNumber }))) {
      return res.status(400).json({ message: "Roll Number already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);
    await new User({
      username,
      password: hashed,
      role: "student",
      fullName: fullName || username,
      rollNumber: rollNumber || username,
    }).save();

    res.status(201).json({ message: "Test student user created successfully" });
  } catch (err) {
    console.error("Error creating test student:", err);
    res.status(500).json({ message: "Server Error during registration." });
  }
});

// Add simple 404 handler
app.use((req, res, next) => {
  res
    .status(404)
    .send(
      "404 Not Found: The requested resource was not found on this server."
    );
});

// Start server
app.listen(PORT, () => {
  console.log(`Student Mark Tracker server running on port ${PORT}`);
});
