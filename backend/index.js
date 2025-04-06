// Required dependencies
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
require('dotenv').config();
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log('Uploads directory created');
}

// Setup email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend'));
app.use(express.static(path.join(__dirname, '../public')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

// MongoDB Schemas
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // treated as email
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}));

const Vehicle = mongoose.model('Vehicle', new mongoose.Schema({
  vehicleNumber: { type: String, required: true },
  vehicleType: { type: String, required: true },
  brandModel: { type: String, required: true },
  registrationYear: { type: String, required: true },
  documents: { type: String, required: true }
}));

// Routes
app.get('/', (req, res) => {
  const loggedInUser = req.session.userId;
  res.render('home', { loggedIn: !!loggedInUser });
});

app.get('/about', (req, res) => res.render('about'));
app.get('/products', (req, res) => res.render('products'));
app.get('/contact', (req, res) => res.render('contact'));

// Signup
app.get('/signup', (req, res) => {
  const error = req.query.error;
  res.render('signup', { error });
});

app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.redirect('/signup?error=userexists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    req.session.userId = newUser._id;
    res.redirect('/login');
  } catch (error) {
    console.error(error);
    res.redirect('/signup?error=signupfailed');
  }
});

// Login
app.get('/login', (req, res) => {
  const error = req.query.error || null;
  res.render('login', { error });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.redirect('/login?error=invalid');

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.redirect('/login?error=invalid');

    req.session.userId = user._id;
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.redirect('/login?error=loginfailed');
  }
});

// Forgot Password Form Page
app.get('/reset-password', (req, res) => {
  const error = req.query.error || null;
  res.render('reset-password', { error });
});

// Handle Reset Request
app.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.redirect('/reset-password?error=emailnotfound');

    const resetLink = `http://localhost:${PORT}/reset-password/${user._id}`;
    await transporter.sendMail({
      from: process.env.EMAIL,
      to: email,
      subject: 'Reset Your Password - PingME',
      text: `Click this link to reset your password: ${resetLink}`
    });

    res.redirect('/login?message=resetlinksent');
  } catch (error) {
    console.error(error);
    res.redirect('/reset-password?error=sendfailed');
  }
});

// Reset Password Form (dynamic URL)
app.get('/reset-password/:userId', (req, res) => {
  res.render('reset-password-form', { userId: req.params.userId });
});

// Handle actual password reset POST
app.post('/reset-password/:userId', async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.params.userId;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });
    res.redirect('/login?message=passwordreset');
  } catch (err) {
    console.error(err);
    res.redirect(`/reset-password/${userId}?error=resetfailed`);
  }
});

// Vehicle Details
app.get('/vehicle-details', (req, res) => {
  const loggedInUser = req.session.userId;
  if (loggedInUser) {
    res.render('vehicle-details', { username: 'correctUser' });
  } else {
    res.redirect('/login');
  }
});

// Upload Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/submit-vehicle-details', upload.single('documents'), async (req, res) => {
  const { vehicleNumber, vehicleType, brandModel, registrationYear } = req.body;
  const documentPath = req.file ? req.file.path : null;

  try {
    const newVehicle = new Vehicle({
      vehicleNumber,
      vehicleType,
      brandModel,
      registrationYear,
      documents: documentPath
    });

    await newVehicle.save();
    res.redirect('/payment');
  } catch (error) {
    console.error(error);
    res.redirect('/vehicle-details?error=vehicleDetailsFailed');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.redirect('/');
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// Buy Now
app.get('/buy-now', (req, res) => {
  const loggedInUser = req.session.userId;
  res.redirect(loggedInUser ? '/vehicle-details' : '/signup');
});

// Payment
app.get('/payment', (req, res) => {
  const loggedInUser = req.session.userId;
  res.render(loggedInUser ? 'payment' : 'login');
});

app.post('/payment', (req, res) => {
  const { paymentMethod, amount } = req.body;
  console.log('Payment Method:', paymentMethod, 'Amount:', amount);
  res.redirect('/payment-success');
});

app.get('/payment-success', (req, res) => {
  res.render('payment-success');
});

app.get('/download-sticker', (req, res) => {
  const stickerPath = path.join(__dirname, '../public/stickers/sticker.png');
  res.download(stickerPath, 'sticker.png', err => {
    if (err) {
      console.error('Download error:', err);
      res.status(500).send('Download failed');
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
