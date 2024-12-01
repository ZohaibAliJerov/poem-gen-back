// src/routes/auth.js
const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { 
    registerValidationRules, 
    loginValidationRules, 
    resetPasswordValidationRules 
} = require('../middleware/validators');

// Register
router.post('/register', async (req, res) => {
    try {
        const result = await AuthService.register(req.body);
        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Login
router.post('/login', loginValidationRules, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await AuthService.login(email, password);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(401).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Verify Email
router.get('/verify-email/:token', async (req, res) => {
    try {
        const result = await AuthService.verifyEmail(req.params.token);
        res.json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        await AuthService.forgotPassword(email);
        res.json({
            success: true,
            message: 'Password reset instructions sent to your email'
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Reset Password
router.post('/reset-password/:token', resetPasswordValidationRules, async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        await AuthService.resetPassword(token, password);
        res.json({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Google Authentication
router.post('/google', async (req, res) => {
    try {
        const { email, name, googleId, picture } = req.body;
        const result = await AuthService.googleAuth({ 
            email, 
            name, 
            googleId, 
            picture 
        });
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
});

module.exports = router;