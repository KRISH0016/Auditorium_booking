// Required packages
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

require("dotenv").config(); // Load environment variables from .env

const maxAge = 3 * 24 * 60 * 60;

// Express app setup
const app = express();
app.use(express.static("./"));
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
const db = async () => {
  try {
    await mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB", error);
  }
};

const createToken = (id) => {
  return jwt.sign({ id }, process.env.SECRET_TOKEN, { expiresIn: maxAge });
};

const { requireAuth } = require("./middleware/check");

// Mongoose User schema and model
// const userSchema = new mongoose.Schema({
//   email: { type: String, required: true },
//   password: { type: String, required: true },
//   name: String,
//   dept: String,
//   twoFASecret: String,
//   twoFAauthen: { type: Boolean, default: false }, // New field to track whether 2FA has been authenticated
// });
const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  password: { type: String, required: true },
  name: String,
  dept: String,
  phone: String, // New field for phone number
  twoFASecret: String,
  twoFAauthen: { type: Boolean, default: false },
});

const User = mongoose.model("User", userSchema);

// // Mongoose Booking schema and model
// const bookingSchema = new mongoose.Schema({
//   auditorium: { type: String, required: true },
//   date: { type: Date, required: true },
//   slot: { type: String, required: true },
//   start: { type: String, required: true },
//   end: { type: String, required: true },
//   events_name: { type: String, required: true },
//   user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   status: { type: String, default: "pending" },
//   amenities: { type: [String], default: [] }, // Define amenities field
// });

// Mongoose Booking schema and model
const bookingSchema = new mongoose.Schema({
  auditorium: { type: String, required: true },
  date: { type: Date, required: true },
  slot: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  events_name: { type: String, required: true },
  events_resourceperson: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, default: "pending" },
  amenities: { type: [String], default: [] }, // Define amenities field
});

const Booking = mongoose.model("Booking", bookingSchema);

// Register route
app.post("/register", async (req, res) => {
  const { email, password, name, department, phone } = req.body;

  try {
    // Check if the email is from the allowed domain
    if (!email.endsWith("tce.edu")) {
      return res.status(400).json({
        success: false,
        message: "Registration only allowed for tce.edu emails.",
      });
    }

    // Check if the user already exists
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists." });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user object
    const user = new User({
      email,
      password: hashedPassword,
      dept: department,
      name,
      phone,
    });

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    user.twoFASecret = otp;

    // Save user to database
    await user.save();

    // Configure nodemailer transport using environment variables
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Mail options for OTP
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    };

    // Send OTP email
    await transporter.sendMail(mailOptions);
    console.log("Sent mail");
    res.redirect("/otp");
    console.log("Redirecting");
  } catch (error) {
    console.error("Error during registration: ", error);
    res.status(500).json({ message: "Server error during registration." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname + "/template/login.html"));
  //res.redirect('https://auditorium-booking-i34f.onrender.com/');
});

// Login route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email });

  // Check if user exists and password matches
  if (!user || !(await bcrypt.compare(password, user.password))) {
    console.log("INvalid Credentials");
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }
  const token = createToken(user._id);
  if (!user.twoFAauthen) {
    console.log("Validate OTP");
    return res.status(401).json({
      success: false,
      message: "OTP verification is pending. Please verify your OTP first.",
    });
  }

  // Successful login
  res.status(200).json({
    success: true,
    message: "Login successful",
    data: user,
    token: token,
  });
});

// OTP verification route
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  // Find user by email
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ message: "User not found." });
  }

  // Compare OTP
  if (otp !== user.twoFASecret) {
    //await User.deleteOne({ email }); // Delete user if OTP is invalid
    return res
      .status(400)
      .json({ message: "Invalid OTP. Registration failed." });
  }

  // OTP verified successfully
  user.twoFAauthen = true; // Update the 2FA authentication status to true
  user.twoFASecret = null; // Optionally clear the OTP secret after successful verification
  await user.save(); // Save the updated user data
  res
    .status(200)
    .json({ success: true, message: "OTP verified successfully." });
});

// OTP verification route
// app.post("/verify-otp", async (req, res) => {
//   const { email, otp } = req.body;

//   // Find user by email
//   const user = await User.findOne({ email });

//   if (!user) {
//     return res.status(400).json({ message: "User not found." });
//   }

//   // Compare OTP
//   if (otp !== user.twoFASecret) {
//     await User.deleteOne({ email });
//     return res
//       .status(400)
//       .json({ message: "Invalid OTP. Registration failed." });
//   }

//   // OTP verified successfully
//   res
//     .status(200)
//     .json({ success: true, message: "OTP verified successfully." });
// });

//Booking route (users create a booking request)
app.post("/book", requireAuth, async (req, res) => {
  console.log("Request");
  console.log("Request Body:", req.body); // Log the request body
  const {
    userId,
    auditorium,
    date,
    slot,
    start,
    end,
    amenities,
    events_name,
    events_resourceperson,
  } = req.body;
  console.log(userId);
  try {
    // Create new booking request

    // Assuming you fetch the user by email from your 'users' collection
    const user = await User.findOne({ _id: userId });
    console.log(user);
    if (!user) {
      return res.status(400).send("User not found");
    }

    const booking = new Booking({
      auditorium: auditorium,
      date: date,
      slot: slot,
      start: start,
      end: end,
      events_name: events_name,
      events_resourceperson: events_resourceperson,
      user: user._id,
      amenities: amenities || [], // Include amenities
      status: "pending",
    });

    console.log(booking);

    // Save the booking in the database
    await booking.save();
    res.status(200).json({
      success: true,
      message:
        "Booking request submitted successfully. Pending admin approval.",
    });
  } catch (error) {
    console.error("Error during booking: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create booking request." });
  }
});

app.get("/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find(); // Fetch all bookings from the database
    res.json(bookings); // Send bookings as JSON response
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).send("Server Error");
  }
});

app.get("/bookings/:userID", async (req, res) => {
  try {
    const userID = req.params.userID;
    const bookings = await Booking.find({ user: userID }); // Fetch all bookings from the database
    res.json(bookings); // Send bookings as JSON response
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).send("Server Error");
  }
});

app.get("/admin", async (req, res) => {
  res.sendFile(path.join(__dirname + "/template/admin.html"));
});

// Admin panel (view all bookings)
// app.get("admin/bookings", async (req, res) => {
//   const bookings = await Booking.find().populate("user");
//   res.status(200).json(bookings);
// });
// Admin panel (view all bookings)
app.get("/admin/bookings", async (req, res) => {
  try {
    // console.log("Calling booking route");
    const bookings = await Booking.find().populate("user", "name dept _id");
    // console.log(bookings);
    res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).send("Server Error");
  }
});

// Admin approval route
app.post("/admin/approve", async (req, res) => {
  console.log("Approval request");
  const { bookingId } = req.body;
  console.log("Booking id received: " + bookingId);
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found." });
  }

  // Update booking status to approved
  booking.status = "Approved";
  await booking.save();

  // Send approval email to user
  const user = await User.findById(booking.user);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptionsUser = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Booking Approved",
    text: `Your booking for the auditorium on ${booking.date} has been approved.`,
  };

  await transporter.sendMail(mailOptionsUser);

  // Prepare emails for cleaning team, powerhouse, and audio technician
  const cleaningTeamEmail = process.env.CLEANING_TEAM_EMAIL;
  const powerhouseEmail = process.env.POWERHOUSE_EMAIL;
  const audioTechnicianEmail = process.env.AUDIO_TECHNICIAN_EMAIL;

  const amenitiesList =
    booking.amenities.length > 0
      ? `Amenities: ${booking.amenities.join(", ")}`
      : "No amenities selected.";
  const userName = user.name; // Get user name
  const userDept = user.dept; // Get user department

  const formattedDate = new Date(booking.date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // const BookingDetailMessage = `
  // Booking Details:
  // Date: ${formattedDate}
  // Auditorium: ${
  //   booking.auditorium === "auditorium1" ? "KS" :
  //   booking.auditorium === "auditorium2" ? "KK" :
  //   "Open Air Audi"
  // }
  // Session: ${booking.slot === "morning" ? "FN" : "AN"}
  // Event Name: ${booking.events_name}
  // Name: ${user.name}
  // Dept: ${user.dept}
  // Phone No: ${user.phone}`;
  const BookingDetailMessage = `
  Booking Details:
  Date: ${formattedDate}
  Auditorium: ${
    booking.auditorium === "auditorium1"
      ? "KS"
      : booking.auditorium === "auditorium2"
      ? "KK"
      : booking.auditorium === "auditorium3"
      ? "Open Air Auditorium"
      : booking.auditorium === "auditorium4"
      ? "Main Ground"
      : booking.auditorium === "auditorium5"
      ? "Indoor Stadium"
      : booking.auditorium === "auditorium6"
      ? "CSE Seminar Hall"
      : booking.auditorium === "auditorium7"
      ? "IT Seminar Hall"
      : booking.auditorium === "auditorium8"
      ? "ECE Seminar Hall"
      : booking.auditorium === "auditorium9"
      ? "EEE Seminar Hall"
      : booking.auditorium === "auditorium10"
      ? "Mechanical Seminar Hall"
      : booking.auditorium === "auditorium11"
      ? "Mechatronics Seminar Hall"
      : "Unknown Auditorium"
  }
  Start Time: ${booking.start} 
  End Time: ${booking.end} 
  Event Name: ${booking.events_name}
  Name: ${user.name}
  Dept: ${user.dept}
  Phone No: ${user.phone}`;

  const mailOptionsCleaning = {
    from: process.env.EMAIL_USER,
    to: cleaningTeamEmail,
    subject: "New Booking Approved",
    text: `A new booking has been approved for ${booking.date} by ${userName} from the ${userDept} department. Please prepare the cleaning accordingly. For further info contact ${user.phone}.\n\n${BookingDetailMessage}`,
  };

  const mailOptionsPowerhouse = {
    from: process.env.EMAIL_USER,
    to: powerhouseEmail,
    subject: "New Booking Approved",
    text: `A new booking has been approved for ${booking.date} by ${userName} from the ${userDept} department. Please ensure power setup is ready. For further info contact ${user.phone}.\n\n${BookingDetailMessage}`,
  };

  const mailOptionsAudioTechnician = {
    from: process.env.EMAIL_USER,
    to: audioTechnicianEmail,
    subject: "New Booking Approved",
    text: `A new booking has been approved for ${booking.date} by ${userName} from the ${userDept} department. For further info contact ${user.phone}. ${amenitiesList}.\n\n${BookingDetailMessage}`,
  };

  // Send emails to the cleaning team, powerhouse, and audio technician
  await transporter.sendMail(mailOptionsCleaning);
  await transporter.sendMail(mailOptionsPowerhouse);
  await transporter.sendMail(mailOptionsAudioTechnician);

  res
    .status(200)
    .json({ success: true, message: "Booking approved and emails sent." });
});

// // Admin approval route
// app.post("/admin/approve", async (req, res) => {
//   const { bookingId } = req.body;
//   console.log("Booking id received :" + bookingId);
//   const booking = await Booking.findById(bookingId);

//   if (!booking) {
//     return res
//       .status(404)
//       .json({ success: false, message: "Booking not found." });
//   }

//   // Update booking status to approved
//   booking.status = "Approved";
//   await booking.save();

//   // Send approval email to user
//   const user = await User.findById(booking.user);
//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//   });

//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: user.email,
//     subject: "Booking Approved",
//     text: `Your booking for the auditorium on ${booking.date} has been approved.`,
//   };

//   await transporter.sendMail(mailOptions);

//   res
//     .status(200)
//     .json({ success: true, message: "Booking approved and email sent." });
// });

const dotenv = require("dotenv");
const { CallTracker } = require("assert");
dotenv.config();

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  // Check credentials against environment variables
  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    // If credentials match, send a success response
    // const token = createToken(user._id);
    return res
      .status(200)
      .json({ success: true, message: "Login successful." });
  }

  // If credentials don't match, send an error response
  return res
    .status(401)
    .json({ success: false, message: "Invalid credentials." });
});

// app.post("/slot", async (req, res) => {
//   const { start, end, userId, date } = req.body;
//   console.log(start, end, userId, date);
//   await Booking.findOne({ start: start, end: end, user: userId, date: date })
//     .then((booking) => {
//       console.log(booking);
//       return res.status(200).send(booking);
//     })
//     .catch((err) => {
//       return err;
//     });
// });
// Backend logic (in your Node.js/Express app)
app.post("/slotcheck", async (req, res) => {
  const { start, end, userId, date, slotdetails } = req.body;
  
  const auditorium = slotdetails.split('%')[0]; // Extracting auditorium

  try {
    const existingBooking = await Booking.findOne({
      date: date,
      auditorium: auditorium,
      $or: [
        { start: { $lt: end }, end: { $gt: start } }, // Overlap condition
      ],
    });
    

    if (existingBooking) {
      if (existingBooking.status === "Approved") {
        return res.status(200).send({
          message:
            "Slot is already booked and approved. Your booking will be marked as pending for admin approval.",
        });
      } else if (existingBooking.status === "pending") {
        return res.status(200).send({
          message: "Slot is already booked but pending admin approval. Your booking will be added to the queue.",
        });
      }
    }

    // Slot is available
    res.status(200).send({
      message: "Slot is available for booking.",
    });
  } catch (err) {
    res.status(500).send({
      error: "An error occurred while checking the slot availability.",
    });
  }
});

app.post("/slot", async (req, res) => {
  const { start, end, userId, date } = req.body;
  const startTime = new Date(start);
  const endTime = new Date(end);

  try {
    const existingBooking = await Booking.findOne({
      date: date,
      $or: [{ start: { $lte: endTime }, end: { $gte: startTime } }],
    });

    if (existingBooking) {
      if (existingBooking.status === "approved") {
        return res.status(200).send({
          message:
            "Slot is already booked and approved. Your booking is pending admin approval.",
        });
      } else {
        return res.status(200).send({
          message: "Slot is already booked but waiting for admin approval.",
        });
      }
    }

    const newBooking = new Booking({
      start,
      end,
      user: userId,
      date,
      status: "pending",
    });
    await newBooking.save();
    res.status(201).send({
      message: "Booking created successfully. Waiting for admin approval.",
      booking: newBooking,
    });
  } catch (err) {
    res
      .status(500)
      .send({ error: "An error occurred while processing your request." });
  }
});

app.post("/cancel", requireAuth, async (req, res) => {
  const { userId, bookingId } = req.body;

  console.log("Cancel Booking", bookingId, userId);
  // try {
  //   const booking = await Booking.findById(bookingId);
  // } catch (error) {
  //   return res
  //     .status(403)
  //     .json({ success: false, message: "Booking is not found." });
  // }
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found." });
  }

  // Remove booking from database
  await Booking.deleteOne({ _id: bookingId });

  // Send cancellation email to user
  const user = await User.findById(booking.user);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Booking Cancelled",
    text: `Your booking for the auditorium on ${booking.date} has been cancelled.`,
  };

  await transporter.sendMail(mailOptions);

  res.status(200).json({ success: true, message: "Booking cancelled." });
});

// Admin cancellation route
app.post("/admin/cancel", async (req, res) => {
  const { bookingId } = req.body;

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    return res
      .status(404)
      .json({ success: false, message: "Booking not found." });
  }

  // Remove booking from database
  await Booking.deleteOne({ _id: bookingId })
    .then(async (output) => {
      await User.findById(booking.user)
        .then(async (user) => {
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          console.log(user.email, process.env.EMAIL_USER);

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Booking Cancelled",
            text: `Your booking for the auditorium on ${booking.date} has been cancelled.`,
          };

          await transporter.sendMail(mailOptions);

          res.status(200).json({
            success: true,
            message: "Booking cancelled and email sent.",
          });
        })
        .catch((err) => {
          console.log("Inner error", err);
          res
            .status(500)
            .json({ success: false, message: "Internal server error" });
        });
    })
    .catch((err) => {
      console.log("Outer error", err);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    });
});
app.get("/admin-login", async (req, res) => {
  res.sendFile(path.join(__dirname, "template/admin-login.html"));
});
// Serve booking page
app.get("/booking", async (req, res) => {
  res.sendFile(path.join(__dirname, "template/booking.html"));
});

// Serve OTP page
app.get("/otp", (req, res) => {
  res.sendFile(path.join(__dirname, "template/otp.html"));
});

// Start server
app.listen(3000, () => {
  db(); // Connect to MongoDB when server starts
  console.log("Server running on port 3000");
});
