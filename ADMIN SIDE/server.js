const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const Admin = require("./models/Admin"); // Import Admin model
const authMiddleware = require("./middleware/auth"); // Auth middleware

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection failed:", err));

// Routes

// Register admin
app.post("/admin/register", async (req, res) => {
  try {
    const { name, phone, department, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new Admin({
      name,
      phone,
      department,
      email,
      password: hashedPassword,
    });

    await admin.save();
    res.status(201).send({ message: "Admin registered successfully." });
  } catch (error) {
    res.status(500).send({ error: "Registration failed.", details: error.message });
  }
});

// Send OTP
app.post("/admin/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) return res.status(404).send({ error: "Admin not found." });

    const otp = admin.generateOTP();
    await admin.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Your OTP for Two-Factor Authentication",
      text: `Your OTP is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).send({ message: "OTP sent to email." });
  } catch (error) {
    res.status(500).send({ error: "Failed to send OTP.", details: error.message });
  }
});

// Verify OTP
app.post("/admin/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) return res.status(404).send({ error: "Admin not found." });

    if (admin.secretKey === otp && admin.otpExpires > Date.now()) {
      admin.twoFactorAuth = true;
      admin.secretKey = null;
      admin.otpExpires = null;
      await admin.save();

      res.status(200).send({ message: "OTP verified successfully." });
    } else {
      res.status(400).send({ error: "Invalid or expired OTP." });
    }
  } catch (error) {
    res.status(500).send({ error: "OTP verification failed.", details: error.message });
  }
});

// Login
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) return res.status(404).send({ error: "Admin not found." });
    if (!admin.twoFactorAuth)
      return res.status(403).send({ error: "Two-factor authentication not completed." });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(400).send({ error: "Invalid password." });

    const token = admin.generateAuthToken();
    res.status(200).send({ message: "Login successful.", token });
  } catch (error) {
    res.status(500).send({ error: "Login failed.", details: error.message });
  }
});

// Protected route
app.get("/admin/dashboard", authMiddleware, (req, res) => {
  res.send({ message: "Welcome to the admin dashboard!" });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
