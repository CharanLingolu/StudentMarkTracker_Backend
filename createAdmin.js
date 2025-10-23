require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const DB_URL =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/studentmarktracker";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
});
const User = mongoose.model("User", userSchema);

async function createAdmin() {
  await mongoose.connect(DB_URL);
  const hashedPassword = await bcrypt.hash("Charan@563", 10);
  await new User({
    username: "CharanLingolu",
    password: hashedPassword,
    role: "admin",
  }).save();
  console.log("Admin created successfully");
  await mongoose.disconnect();
}

createAdmin().catch(console.error);
