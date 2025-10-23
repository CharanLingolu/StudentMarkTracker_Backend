// In server.js
const studentSchema = new mongoose.Schema(
  {
    // 1. MUST NOT have unique: true here
    rollNumber: { type: String, required: true, trim: true },
    studentName: { type: String, required: true, trim: true },
    marks: { type: Number, required: true, min: 0, max: 100 },
    subject: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// 2. The index MUST be applied separately as a compound key:
studentSchema.index({ rollNumber: 1, subject: 1 }, { unique: true });
