// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// Import middleware
const errorHandler = require('./middleware/error');

// Initialize express
const app = express();

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 100,
    wtimeoutMS: 2500,
    minPoolSize: 10
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// Global Middlewares
app.use(helmet()); // Security headers
app.use(cors({
    origin: "*",
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/profile', require('./routes/profile'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/poems', require('./routes/poems'));
app.use('/api/subscriptions', require('./routes/subscriptions'));

// Handle 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource does not exist'
    });
});

// Global error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    console.log('🔄 Received shutdown signal. Closing HTTP server...');
    
    // Close MongoDB connection
    mongoose.connection.close(false)
        .then(() => {
            console.log('✅ MongoDB connection closed.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Error during MongoDB disconnect:', err);
            process.exit(1);
        });
}

// Export app
module.exports = app;
