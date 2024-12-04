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

const twilio = require("twilio");

// Twilio credentials (make sure to secure these in environment variables)
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

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
//QRHEQATHQR

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

// SectionTechnician schema
const sectionTechnicianSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },
  sectionName: { type: String, required: true },
  technicianNames: { type: [String], required: true }, // Changed to an array of strings
  userId:  { type: String, required: true },
  //userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});


const SectionTechnician = mongoose.model(
  "SectionTechnician",
  sectionTechnicianSchema
);

const technicianSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String, // Optional field for phone number
  available: { type: Boolean, default: true }, // Track technician availability
});

const Technician = mongoose.model("Technician", technicianSchema);

//module.exports = Technician;

const sectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  //description: String, // Optional field for additional description
  // technicians: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Technician' }], // References the Technician model
  //isActive: { type: Boolean, default: true }, // Tracks if the section is active
});

const Section = mongoose.model("Section", sectionSchema);

//module.exports = Section;

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
// Import Twilio

app.post("/admin/approve", async (req, res) => {
  console.log("Approval request");
  const { bookingId } = req.body; // Accept sectionData from frontend
  console.log("Booking id received: " + bookingId);
  const booking = await Booking.findById(bookingId);

  //const { bookingId } = req.body;
  //console.log("Booking id received: " + bookingId);
  //const booking = await Booking.findById(bookingId);

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

  // Prepare emails for cleaning team, powerhouse, and audio technician
  const cleaningTeamEmail = process.env.CLEANING_TEAM_EMAIL;
  const powerhouseEmail = process.env.POWERHOUSE_EMAIL;
  const audioTechnicianEmail = process.env.AUDIO_TECHNICIAN_EMAIL;

  const amenitiesList =
    booking.amenities.length > 0
      ? `Amenities: ${booking.amenities.join(", ")}`
      : "No amenities selected.";
  const userName = user.name;
  const userDept = user.dept;

  const formattedDate = new Date(booking.date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
      ? "Civil Seminar Hall"
      : booking.auditorium === "auditorium12"
      ? "Architecture Seminar Hall"
      : "Unknown Auditorium"
  }
  Start Time: ${booking.start} 
  End Time: ${booking.end} 
  Event Name: ${booking.events_name}
  Name: ${user.name}
  Dept: ${user.dept}
  Phone No: ${user.phone}`;

  const mailOptionsUser = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Booking Approved",
    text: `Your booking has been approved. Booking details:\n\n${BookingDetailMessage}`,
  };
  //for the auditorium on ${booking.date}
  await transporter.sendMail(mailOptionsUser);

  // Prepare and send SMS to the user
  const userPhoneNumber = user.phone; // Assuming user phone number is stored in the database
  if (userPhoneNumber) {
    await client.messages.create({
      body: `Your booking for the auditorium on ${booking.date} has been approved. For more details, please check your email.`,
      to: userPhoneNumber, // User's phone number
      from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio number
    });
  }

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

  // Send SMS notifications to cleaning team, powerhouse, and audio technician
  const cleaningTeamPhoneNumber = process.env.CLEANING_TEAM_PHONE;
  const powerhousePhoneNumber = process.env.POWERHOUSE_PHONE;
  const audioTechnicianPhoneNumber = process.env.AUDIO_TECHNICIAN_PHONE;

  if (cleaningTeamPhoneNumber) {
    await client.messages.create({
      body: `New booking for ${formattedDate} by ${userName} from ${userDept}. Cleaning required. Contact: ${user.phone}.`,
      to: cleaningTeamPhoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
  }

  if (powerhousePhoneNumber) {
    await client.messages.create({
      body: `New booking for ${formattedDate} by ${userName} from ${userDept}. Power setup required. Contact: ${user.phone}.`,
      to: powerhousePhoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
  }

  if (audioTechnicianPhoneNumber) {
    await client.messages.create({
      body: `New booking for ${formattedDate} by ${userName} from ${userDept}. Audio setup required. Contact: ${user.phone}.`,
      to: audioTechnicianPhoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
  }

  res.status(200).json({
    success: true,
    message: "Booking approved, emails, and SMS sent.",
  });
});

// // Admin approval route
// app.post("/admin/approve", async (req, res) => {
//   console.log("Approval request");
//   const { bookingId } = req.body;
//   console.log("Booking id received: " + bookingId);
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

//   const mailOptionsUser = {
//     from: process.env.EMAIL_USER,
//     to: user.email,
//     subject: "Booking Approved",
//     text: `Your booking for the auditorium on ${booking.date} has been approved.`,
//   };

//   await transporter.sendMail(mailOptionsUser);

//   // Prepare emails for cleaning team, powerhouse, and audio technician
//   const cleaningTeamEmail = process.env.CLEANING_TEAM_EMAIL;
//   const powerhouseEmail = process.env.POWERHOUSE_EMAIL;
//   const audioTechnicianEmail = process.env.AUDIO_TECHNICIAN_EMAIL;

//   const amenitiesList =
//     booking.amenities.length > 0
//       ? `Amenities: ${booking.amenities.join(", ")}`
//       : "No amenities selected.";
//   const userName = user.name; // Get user name
//   const userDept = user.dept; // Get user department

//   const formattedDate = new Date(booking.date).toLocaleDateString("en-IN", {
//     year: "numeric",
//     month: "long",
//     day: "numeric",
//   });
//   // const BookingDetailMessage = `
//   // Booking Details:
//   // Date: ${formattedDate}
//   // Auditorium: ${
//   //   booking.auditorium === "auditorium1" ? "KS" :
//   //   booking.auditorium === "auditorium2" ? "KK" :
//   //   "Open Air Audi"
//   // }
//   // Session: ${booking.slot === "morning" ? "FN" : "AN"}
//   // Event Name: ${booking.events_name}
//   // Name: ${user.name}
//   // Dept: ${user.dept}
//   // Phone No: ${user.phone}`;
//   const BookingDetailMessage = `
//   Booking Details:
//   Date: ${formattedDate}
//   Auditorium: ${
//     booking.auditorium === "auditorium1"
//       ? "KS"
//       : booking.auditorium === "auditorium2"
//       ? "KK"
//       : booking.auditorium === "auditorium3"
//       ? "Open Air Auditorium"
//       : booking.auditorium === "auditorium4"
//       ? "Main Ground"
//       : booking.auditorium === "auditorium5"
//       ? "Indoor Stadium"
//       : booking.auditorium === "auditorium6"
//       ? "CSE Seminar Hall"
//       : booking.auditorium === "auditorium7"
//       ? "IT Seminar Hall"
//       : booking.auditorium === "auditorium8"
//       ? "ECE Seminar Hall"
//       : booking.auditorium === "auditorium9"
//       ? "EEE Seminar Hall"
//       : booking.auditorium === "auditorium10"
//       ? "Mechanical Seminar Hall"
//       : booking.auditorium === "auditorium11"
//       ? "Civil Seminar Hall"
//       : booking.auditorium === "auditorium12"
//       ? "Architecture Seminar Hall"
//       : "Unknown Auditorium"
//   }
//   Start Time: ${booking.start}
//   End Time: ${booking.end}
//   Event Name: ${booking.events_name}
//   Name: ${user.name}
//   Dept: ${user.dept}
//   Phone No: ${user.phone}`;

//   const mailOptionsCleaning = {
//     from: process.env.EMAIL_USER,
//     to: cleaningTeamEmail,
//     subject: "New Booking Approved",
//     text: `A new booking has been approved for ${booking.date} by ${userName} from the ${userDept} department. Please prepare the cleaning accordingly. For further info contact ${user.phone}.\n\n${BookingDetailMessage}`,
//   };

//   const mailOptionsPowerhouse = {
//     from: process.env.EMAIL_USER,
//     to: powerhouseEmail,
//     subject: "New Booking Approved",
//     text: `A new booking has been approved for ${booking.date} by ${userName} from the ${userDept} department. Please ensure power setup is ready. For further info contact ${user.phone}.\n\n${BookingDetailMessage}`,
//   };

//   const mailOptionsAudioTechnician = {
//     from: process.env.EMAIL_USER,
//     to: audioTechnicianEmail,
//     subject: "New Booking Approved",
//     text: `A new booking has been approved for ${booking.date} by ${userName} from the ${userDept} department. For further info contact ${user.phone}. ${amenitiesList}.\n\n${BookingDetailMessage}`,
//   };

//   // Send emails to the cleaning team, powerhouse, and audio technician
//   await transporter.sendMail(mailOptionsCleaning);
//   await transporter.sendMail(mailOptionsPowerhouse);
//   await transporter.sendMail(mailOptionsAudioTechnician);

//   res
//     .status(200)
//     .json({ success: true, message: "Booking approved and emails sent." });
// });

const dotenv = require("dotenv");
const { CallTracker } = require("assert");
dotenv.config();

// app.post("/admin/login", async (req, res) => {
//   const { email, password } = req.body;

//   // Check credentials against environment variables
//   if (
//     email === process.env.ADMIN_EMAIL &&
//     password === process.env.ADMIN_PASSWORD
//   ) {
//     // If credentials match, send a success response
//     // const token = createToken(user._id);
//     return res
//       .status(200)
//       .json({ success: true, message: "Login successful." });
//   }

//   // If credentials don't match, send an error response
//   return res
//     .status(401)
//     .json({ success: false, message: "Invalid credentials." });
// });


app.post("/slotcheck", async (req, res) => {
  const { start, end, userId, date, slotdetails } = req.body;

  const auditorium = slotdetails.split("%")[0]; // Extracting auditorium

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
          message:
            "Slot is already booked but pending admin approval. Your booking will be added to the queue.",
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

  try {
    const startTime = new Date(start);
    const endTime = new Date(end);

    // Adjust the query to check for full or partial overlaps in time
    const existingBooking = await Booking.findOne({
      date: date,
      $or: [
        { start: { $lte: endTime }, end: { $gte: startTime } }, // Time overlap case
      ],
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

    // Proceed to create a new booking if no overlap exists
    const newBooking = new Booking({
      start,
      end,
      user: userId,
      date,
      status: "pending",
    });

    await newBooking.save();

    return res.status(201).send({
      message: "Booking created successfully. Waiting for admin approval.",
      booking: newBooking,
    });
  } catch (err) {
    console.error("Error during slot booking:", err);
    return res.status(500).send({
      error: "An error occurred while processing your request.",
    });
  }
});

// app.post("/slot", async (req, res) => {
//   const { start, end, userId, date } = req.body;
//   const startTime = new Date(start);
//   const endTime = new Date(end);

//   try {
//     const existingBooking = await Booking.findOne({
//       date: date,
//       $or: [{ start: { $lte: endTime }, end: { $gte: startTime } }],
//     });

//     if (existingBooking) {
//       if (existingBooking.status === "approved") {
//         return res.status(200).send({
//           message:
//             "Slot is already booked and approved. Your booking is pending admin approval.",
//         });
//       } else {
//         return res.status(200).send({
//           message: "Slot is already booked but waiting for admin approval.",
//         });
//       }
//     }

//     const newBooking = new Booking({
//       start,
//       end,
//       user: userId,
//       date,
//       status: "pending",
//     });
//     await newBooking.save();
//     res.status(201).send({
//       message: "Booking created successfully. Waiting for admin approval.",
//       booking: newBooking,
//     });
//   } catch (err) {
//     res
//       .status(500)
//       .send({ error: "An error occurred while processing your request." });
//   }
// });

// const express = require("express");
// const router = express.Router();
// const Technician = require("./models/technician");
// const Section = require("./models/section");
// const SectionTechnician = require("./models/sectionTechnician");

// // Add a new technician
// app.post("/addTechnician", async (req, res) => {
//   try {
//     const { name, email, phone } = req.body;

//     if (!name || !email) {
//       return res.status(400).json({ message: "Name and Email are required." });
//     }

//     const technician = new Technician({ name, email, phone });
//     await technician.save();

//     res.status(201).json({ message: "Technician added successfully.", technician });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// // Add a new section
// app.post("/addSection", async (req, res) => {
//   try {
//     const { name, description, technicians } = req.body;

//     if (!name) {
//       return res.status(400).json({ message: "Section name is required." });
//     }

//     const section = new Section({ name, description, technicians });
//     await section.save();

//     res.status(201).json({ message: "Section added successfully.", section });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// // Add a new Section-Technician mapping for a booking
// app.post("/addSectionTechnician", async (req, res) => {
//   try {
//     const { bookingId, sectionName, technicianName, userId } = req.body;

//     if (!bookingId || !sectionName || !technicianName || !userId) {
//       return res.status(400).json({ message: "All fields are required." });
//     }

//     const sectionTechnician = new SectionTechnician({
//       bookingId,
//       sectionName,
//       technicianName,
//       userId,
//     });

//     await sectionTechnician.save();

//     res.status(201).json({ message: "Section-Technician mapping saved successfully." });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// //module.exports = router;

// // API for creating a technician

// // Fetch all technicians from the database
// app.get("/technicians", (req, res) => {
//   Technician.find()
//     .then((technicians) => res.json(technicians))
//     .catch((err) => res.status(400).json({ error: err.message }));
// });
// app.get("/addSectionTechnician", (req,res) =>{
//   Section.find()
//     .then((sections) => res.json(sections))
//     .catch((err) => res.status(400).json({ error: err.message }));
// });

// Schema definitions

// Endpoints

// Add a new technician
app.post("/addTechnician", async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and Email are required." });
    }

    const existingTechnician = await Technician.findOne({ email });
    if (existingTechnician) {
      return res
        .status(400)
        .json({ message: "Technician with this email already exists." });
    }

    const technician = new Technician({ name, email, phone });
    await technician.save();

    res
      .status(201)
      .json({ message: "Technician added successfully.", technician });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Add a new section

app.post("/addSection", async (req, res) => {
  try {
    const { name } = req.body; // Extract 'name' from request body

    if (!name) {
      return res.status(400).json({ message: "Section name is required." });
    }

    const existingSection = await Section.findOne({ sectionName: name });
    if (existingSection) {
      return res
        .status(400)
        .json({ message: "Section with this name already exists." });
    }

    const section = new Section({ name: name });
    await section.save();

    res.status(201).json({ message: "Section added successfully.", section });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// // Add a new section
// app.post("/addSection", async (req, res) => {
//   try {
//     const { sectionName, technicians } = req.body;

//     if (!sectionName) {
//       return res.status(400).json({ message: "Section name is required." });
//     }

//     const existingSection = await Section.findOne({ sectionName });
//     if (existingSection) {
//       return res.status(400).json({ message: "Section with this name already exists." });
//     }

//     const section = new Section({ sectionName, technicians });
//     await section.save();

//     res.status(201).json({ message: "Section added successfully.", section });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// Add a new Section-Technician mapping for a booking


app.post("/saveSectionTechnicianMapping", async (req, res) => {
  try {
    const { bookingId, userId, mapping } = req.body;

    if (!bookingId || !userId || !Array.isArray(mapping)) {
      return res.status(400).json({ message: "Invalid request data." });
    }

    // Prepare grouped data for insertion
    const groupedData = mapping.map(({ sectionName, technicians }) => ({
      bookingId,
      sectionName,
      technicianNames: technicians,
      userId,
    }));

    // Save or update data
    await SectionTechnician.deleteMany({ bookingId }); // Optional: Clear previous entries for the booking
    await SectionTechnician.insertMany(groupedData);

    res.status(201).json({ message: "Mapping saved successfully." });
  } catch (error) {
    console.error("Error saving mapping:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.post("/addSectionTechnician", async (req, res) => {
  try {
    const { bookingId, sections } = req.body;

    if (!bookingId || !sections || sections.length === 0) {
      return res
        .status(400)
        .json({ message: "Booking ID and sections are required." });
    }

    const sectionTechnician = new SectionTechnician({ bookingId, sections });
    await sectionTechnician.save();

    res
      .status(201)
      .json({ message: "Section-Technician mapping saved successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
app.get("/getSectionTechnician", async (req, res) => {
  try {
    // Fetch all technicians
    const technicians = await Technician.find(
      {},
      { _id: 0, name: 1, email: 1, phone: 1 }
    );

    // Fetch all sections
    const sections = await Section.find({}, { _id: 0, name: 1 }); // Fetch only the section names

    // Structure the response
    const formattedSections = sections.map((section) => ({
      sectionName: section.name, // Assuming Section schema has a 'name' field
      technicians: technicians, // Associate all technicians with each section
    }));

    res.status(200).json({
      technicians, // All available technicians
      sections: formattedSections, // Sections with associated technician details
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Endpoint to fetch all sections and technicians
// app.get("/getSectionTechnician", async (req, res) => {
//   try {
//     // Fetch all technicians
//     const technicians = await Technician.find(
//       {},
//       { _id: 0, name: 1, email: 1, phone: 1 }
//     );

//     // Fetch all sections with associated technicians
//     const sections = await Section.find().populate(
//       "technicians",
//       "name email phone"
//     );

//     // Format response data
//     const formattedSections = sections.map((section) => ({
//       sectionName: section.name,
//       technicians: section.technicians.map((tech) => ({
//         name: tech.name,
//         email: tech.email,
//         phone: tech.phone,
//       })),
//     }));

//     res.status(200).json({
//       technicians,
//       sections: formattedSections,
//     });
//   } catch (error) {
//     console.error("Error fetching data:", error);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// Fetch all technicians
app.get("/technicians", async (req, res) => {
  try {
    const technicians = await Technician.find({}, "name email phone");
    res.status(200).json({ technicians });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Fetch all sections
app.get("/sections", async (req, res) => {
  try {
    const sections = await Section.find();
    res.status(200).json({ sections });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Fetch sections and technicians for dialog initialization
app.get("/initializeDialog", async (req, res) => {
  try {
    const technicians = await Technician.find({}, "name email phone");
    const sections = await Section.find();

    res.status(200).json({ technicians, sections });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/cancel", requireAuth, async (req, res) => {
  const { userId, bookingId } = req.body;

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found." });
    }

    // Remove booking from database
    await Booking.deleteOne({ _id: bookingId });

    // Find the user and send an email as before
    const user = await User.findById(booking.user);

    // Send email notification (as before)
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

    // Send SMS notification via Twilio
    const userPhoneNumber = user.phone; // Assume `phone` is stored in the user schema
    if (userPhoneNumber) {
      await client.messages.create({
        body: `Your booking for the auditorium on ${booking.date} has been cancelled.`,
        to: userPhoneNumber, // User's phone number
        from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio number
      });
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled. Notification sent.",
    });
  } catch (error) {
    console.error("Error during cancellation:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to cancel booking." });
  }
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
app.get("/adminlogin", (req, res) => {
  res.sendFile(path.join(__dirname, "template/adminlogin.html"));
});
app.get("/adminotp", (req, res) => {
  res.sendFile(path.join(__dirname, "template/adminotp.html"));
});


// MongoDB Schema for Admin
const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password should be at least 6 characters"],
  },
  department: {
    type: String,
    required: [true, "Department is required"],
  },
  // phone: {
  //   type: String,
  //   required: [true, "Phone number is required"],
  // },
  twoFASecret: {
    type: String,
  },
  twoFAauthen: {
    type: Boolean,
    default: false,
  },
});

// Hash the password before saving it
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare the password during login
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Admin model
const Admin = mongoose.model("Admin", adminSchema);

app.post("/admin/register", async (req, res) => {
  const { name, email, password, department } = req.body;

  try {
    if (!email.endsWith("tce.edu")) {
      return res.status(400).json({
        success: false,
        message: "Registration only allowed for tce.edu emails.",
      });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new Admin({
      name,
      email,
      password: hashedPassword,
      department: department,
    });

    const otp = crypto.randomInt(100000, 999999).toString();
    admin.twoFASecret = otp;
    admin.twoFAauthen = false;

    await admin.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    console.log("Sent mail");

    res.status(200).json({
      success: true,
      message: "Registration successful. Redirecting to OTP page.",
      redirectUrl: "https://auditorium-booking-i34f.onrender.com/adminotp",
    });
  } catch (error) {
    console.error("Error during registration: ", error);
    res.status(500).json({ message: "Server error during registration." });
  }
});



// Admin Login Route
app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  // Find admin by email
  const admin = await Admin.findOne({ email });

  // Check if admin exists and password matches
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    console.log("Invalid Credentials");
    return res
      .status(400)
      .json({ success: false, message: "Invalid credentials" });
  }
  const token = createToken(admin._id);

  if (!admin.twoFAauthen) {
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
    data: admin,
    token: token,
  });
});

// OTP verification route
app.post("/verify-otp-admin", async (req, res) => {
  const { email, otp } = req.body;

  // Find admin by email
  const admin = await Admin.findOne({ email });

  if (!admin) {
    return res.status(400).json({ message: "Admin not found." });
  }

  // Compare OTP
  if (otp !== admin.twoFASecret) {
    return res
      .status(400)
      .json({ message: "Invalid OTP. Registration failed." });
  }

  // OTP verified successfully
  admin.twoFAauthen = true; // Update the 2FA authentication status to true
  admin.twoFASecret = null; // Optionally clear the OTP secret after successful verification
  await admin.save(); // Save the updated admin data
  res
    .status(200)
    .json({ success: true, message: "OTP verified successfully." });
});
app.get("/getAdmins", async (req, res) => {
  try {
    const admins = await Admin.find({}, "name email department ");
    res.status(200).json({ success: true, admins });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});
app.get("/getUsers", async (req, res) => {
  try {
    // Use `.select` to fetch specific fields
    const users = await User.find({}, "name email dept phone");
    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.get("/getTechnicianWorkDetails", async (req, res) => {
  try {
    // Fetch all technicians
    const technicians = await Technician.find({}, "name"); // Fetch only the 'name' field
    const technicianNames = technicians.map((tech) => tech.name);
    console.log(technicianNames);
    // Fetch works for these technicians
    const works = await SectionTechnician.find({
      technicianNames: { $in: technicianNames },
    });
    console.log(works);  // This should show the section and technician works


    // Create a map for fetching bookings
    const bookingIds = works.map((work) => work.bookingId);
    const bookings = await Booking.find({ _id: { $in: bookingIds } });
    console.log(bookings);  // This should show the bookings related to the technicians


    // Combine data
    const technicianWorkDetails = works.map((work) => {
      const booking = bookings.find(
        (b) => b._id.toString() === work.bookingId.toString()
      );
      return {
        SectionName: work.sectionName,
        TechnicianNames: work.technicianNames,
        BookingDate: booking ? booking.date : "N/A",
        StartTime: booking ? booking.start : "N/A",
        EndTime: booking ? booking.end : "N/A",
      };
    });
    console.log(technicianWorkDetails);  // This should display the final array of technician work details


    res.status(200).json({ success: true, data: technicianWorkDetails });
  } catch (error) {
    console.error("Error fetching technician work details:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


// Start server
app.listen(3000, () => {
  db(); // Connect to MongoDB when server starts
  console.log("Server running on port 3000");
});
