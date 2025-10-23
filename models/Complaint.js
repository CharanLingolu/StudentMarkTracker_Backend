const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  studentName: String,
  message: { type: String, required: true },
  status: {
    type: String,
    enum: ["Submitted", "Resolved"],
    default: "Submitted",
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Complaint", complaintSchema);
