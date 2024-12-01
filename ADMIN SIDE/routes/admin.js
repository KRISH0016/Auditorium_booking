const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Admin = require("../models/Admin"); // Import Admin model

const router = express.Router();

// Admin registration
router.post("/register", async (req, res) => {
  try {
    const { name, phone, department, email, password } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new admin
    const admin = new Admin({
      name,
      phone,
      department,
      email,
      password: hashedPassword,
    });

    // Save to database
    await admin.save();

    res.status(201).send({ message: "Admin registered successfully." });
  } catch (error) {
    res.status(500).send({ error: "Registration failed.", details: error.message });
  }
});

// Send OTP for two-factor authentication
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).send({ error: "Admin not found." });

    // Generate OTP
    const otp = admin.generateOTP();
    await admin.save();

    // Send OTP via email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL, // Sender email address
        pass: process.env.EMAIL_PASSWORD, // Sender email password
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Your OTP for Two-Factor Authentication",
      text: `Your OTP is: ${otp}. It is valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).send({ message: "OTP sent to email." });
  } catch (error) {
    res.status(500).send({ error: "Failed to send OTP.", details: error.message });
  }
});

// Verify OTP for two-factor authentication
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).send({ error: "Admin not found." });

    // Validate OTP
    if (admin.secretKey === otp && admin.otpExpires > Date.now()) {
      admin.twoFactorAuth = true; // Enable two-factor authentication
      admin.secretKey = null; // Clear OTP
      admin.otpExpires = null; // Clear OTP expiry
      await admin.save();

      res.status(200).send({ message: "OTP verified successfully." });
    } else {
      res.status(400).send({ error: "Invalid or expired OTP." });
    }
  } catch (error) {
    res.status(500).send({ error: "OTP verification failed.", details: error.message });
  }
});

// Admin login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).send({ error: "Admin not found." });

    // Ensure two-factor authentication is completed
    if (!admin.twoFactorAuth)
      return res.status(403).send({ error: "Two-factor authentication not completed." });

    // Validate password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).send({ error: "Invalid password." });

    // Generate JWT
    const token = admin.generateAuthToken();

    res.status(200).send({ message: "Login successful.", token });
  } catch (error) {
    res.status(500).send({ error: "Login failed.", details: error.message });
  }
});

// Export the router
module.exports = router;