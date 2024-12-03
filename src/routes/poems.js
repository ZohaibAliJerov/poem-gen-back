// src/routes/poems.js
const express = require('express');
const router = express.Router();
const poemService = require('../services/PoemService'); // Import the instance directly
const { auth, checkEmailVerification } = require('../middleware/auth');




router.post('/generate-free', async (req, res) => {
    try {
            // Get IP address (handles both direct and proxy cases)
            const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
            req.socket.remoteAddress;
        const poem = await poemService.generatePoemFree(req.body, ip);
        res.json({
            success: true,
            data: poem
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});
// Protect all routes
router.use(auth);
// router.use(checkEmailVerification);

// Generate new poem
router.post('/generate', async (req, res) => {
    try {
        const poem = await poemService.generatePoem(req.user._id, req.body);
        res.json({
            success: true,
            data: poem
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});



// Get user's poems with pagination
router.get('/my-poems', async (req, res) => {
    try {
        const result = await poemService.getUserPoems(req.user._id, req.query);
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

// Delete poem
router.delete('/:id', async (req, res) => {
    try {
        await poemService.deletePoem(req.params.id, req.user._id);
        res.json({
            success: true,
            message: 'Poem deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;