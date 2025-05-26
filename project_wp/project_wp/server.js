// server.js - Backend for Enchanted Bookstore
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/enchanted_bookstore', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✨ Magic database connection established ✨'))
.catch(err => console.error('🔥 Database connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: false, unique: true },
    password: { type: String, required: true },
    googleId: { type: String },
    displayName: String,
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    purchasedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    registeredDate: { type: Date, default: Date.now }
});

// Book Schema
const bookSchema = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: String,
    genre: String,
    price: Number,
    image: String,
    rating: { type: Number, default: 0 },
    published: Date
});

// Create models
const User = mongoose.model('User', userSchema);
const Book = mongoose.model('Book', bookSchema);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: 'enchanted_magic_bookstore_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport local strategy
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const user = await User.findOne({ username });
            
            if (!user) {
                return done(null, false, { message: 'Incorrect username or password.' });
            }
            
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (!isMatch) {
                return done(null, false, { message: 'Incorrect username or password.' });
            }
            
            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

// Passport Google strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Find if user exists with this googleId
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
            return done(null, user);
        }
        
        // If user doesn't exist, create new user
        const newUser = new User({
            googleId: profile.id,
            username: profile.displayName.replace(/\s+/g, '_').toLowerCase() + Math.floor(Math.random() * 1000),
            email: profile.emails[0].value,
            displayName: profile.displayName,
            password: await bcrypt.hash(Math.random().toString(36).slice(-8), 10) // Random password
        });
        
        await newUser.save();
        done(null, newUser);
    } catch (err) {
        done(err, null);
    }
}));

// Serialize and deserialize user
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// ROUTES

// Login route
app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return res.status(500).json({ message: 'Internal server error' });
        }
        
        if (!user) {
            return res.status(401).json({ message: info.message || 'Authentication failed' });
        }
        
        req.login(user, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Login error' });
            }
            
            return res.status(200).json({ 
                message: 'Login successful',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email
                }
            });
        });
    })(req, res, next);
});

// Google OAuth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        res.redirect('/');
    }
);

// Register route
app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        
        if (existingUser) {
            return res.status(400).json({ message: 'Username or email already in use' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });
        
        await newUser.save();
        
        // Auto login after registration
        req.login(newUser, (err) => {
            if (err) {
                return res.status(500).json({ message: 'Login error after registration' });
            }
            
            return res.status(201).json({ 
                message: 'Registration successful',
                user: {
                    id: newUser._id,
                    username: newUser.username,
                    email: newUser.email
                }
            });
        });
        
    } catch (err) {
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/login.html');
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated()) {
        return res.json({
            isAuthenticated: true,
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email
            }
        });
    }
    
    res.json({ isAuthenticated: false });
});

// Route to get all books
app.get('/api/books', async (req, res) => {
    try {
        const books = await Book.find();
        res.json(books);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching books' });
    }
});

// Route to get books by genre
app.get('/api/books/genre/:genre', async (req, res) => {
    try {
        const books = await Book.find({ genre: req.params.genre });
        res.json(books);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching books by genre' });
    }
});

// Route to add book to wishlist
app.post('/api/wishlist/add', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'You must be logged in' });
    }
    
    try {
        const { bookId } = req.body;
        const user = await User.findById(req.user._