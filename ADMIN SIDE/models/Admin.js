const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  department: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  twoFactorAuth: { type: Boolean, default: false },
  secretKey: { type: String }, // OTP
  otpExpires: { type: Date }, // OTP expiry time
});

// Generate OTP
adminSchema.methods.generateOTP = function () {
  const otp = crypto.randomInt(100000, 999999).toString(); // Generate 6-digit OTP
  this.secretKey = otp;
  this.otpExpires = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes
  return otp;
};

// Generate JWT token
adminSchema.methods.generateAuthToken = function () {
  return jwt.sign({ _id: this._id, email: this.email }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};

module.exports = mongoose.model("Admin", adminSchema);
