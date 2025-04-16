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

// Uploads folder setup
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log('Uploads directory created');
}

// Email transporter setup
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

// Middleware to set loggedIn flag in all views
app.use((req, res, next) => {
  res.locals.loggedIn = !!req.session.userId;
  next();
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

// MongoDB Schemas
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
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
  res.render('home');
});

// Route for the Privacy Policy page
app.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy');  // Render the 'privacy-policy.ejs' file
});

// Route for the Refund Policy page
app.get('/refund-policy', (req, res) => {
  res.render('refund-policy');  // Render the 'refund-policy.ejs' file
});

// Route for the Cancellation Policy page
app.get('/cancellation-policy', (req, res) => {
  res.render('cancellation-policy');  // Render the 'cancellation-policy.ejs' file
});

// Route for the Pricing and Shipping page
app.get('/pricing-shipment', (req, res) => {
  res.render('pricing-shipping');  // Render the 'pricing-shipping.ejs' file
});


app.get('/about', (req, res) => res.render('about'));
app.get('/products', (req, res) => res.render('products'));
app.get('/contact', (req, res) => res.render('contact'));

// Signup
app.get('/signup', (req, res) => {
  res.render('signup', { error: req.query.error });
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
  res.render('login', { error: req.query.error || null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.redirect('/login?error=invalid');

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.redirect('/login?error=invalid');

    req.session.userId = user._id;
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.redirect('/login?error=loginfailed');
  }
});

// Forgot Password
app.get('/reset-password', (req, res) => {
  res.render('reset-password', { error: req.query.error || null });
});

app.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.redirect('/reset-password?error=emailnotfound');

    const resetLink = `https://pingme-q34k.onrender.com/reset-password/${user._id}`;
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

app.get('/reset-password/:userId', (req, res) => {
  res.render('reset-password-form', { userId: req.params.userId });
});

app.post('/reset-password/:userId', async (req, res) => {
  const { newPassword } = req.body;
  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.params.userId, { password: hashed });
    res.redirect('/login?message=passwordreset');
  } catch (err) {
    console.error(err);
    res.redirect(`/reset-password/${req.params.userId}?error=resetfailed`);
  }
});

// Vehicle Details
app.get('/vehicle-details', (req, res) => {
  if (req.session.userId) {
    res.render('vehicle-details', { username: 'correctUser' });
  } else {
    res.redirect('/login');
  }
});

// File Upload Setup
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
  res.redirect(req.session.userId ? '/vehicle-details' : '/signup');
});

// Payment
app.get('/payment', (req, res) => {
  res.render(req.session.userId ? 'payment' : 'login');
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
