// src/routes/profile.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');


// Helper function for pagination
const paginateResults = async (model, query, options) => {
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const sort = options.sort || 'createdAt';
    const order = options.order === 'asc' ? 1 : -1;
    
    const totalItems = await model.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    
    const items = await model.find(query)
        .sort({ [sort]: order })
        .skip((page - 1) * limit)
        .limit(limit);

    return {
        items,
        pagination: {
            currentPage: page,
            totalPages,
            totalItems,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        }
    };
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: 'uploads/avatars',
    filename: function(req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 2 }, // 2MB limit
    fileFilter: function(req, file, cb) {
        const filetypes = /jpeg|jpg|png/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
});

// Get user profile
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -verificationToken -resetPasswordToken -resetPasswordExpires');
        
        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error fetching profile'
        });
    }
});

// Update profile information
router.patch('/update', auth, async (req, res) => {
    try {
        const allowedUpdates = ['name', 'profile.name',  'profile.bio',
            'profile.phoneNumber',
            'profile.dateOfBirth',
            'profile.gender'];
        const updates = Object.keys(req.body);
        console.log(updates,'testß')
        const isValidOperation = updates.every(update => allowedUpdates.includes(update));

        if (!isValidOperation) {
            return res.status(400).json({
                success: false,
                error: 'Invalid updates'
            });
        }

        const user = await User.findById(req.user._id);
        
        updates.forEach(update => {
            if (update.includes('.')) {
                const [parent, child] = update.split('.');
                user[parent][child] = req.body[update];
            } else {
                user[update] = req.body[update];
            }
        });

        await user.save();

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Update avatar
router.patch('/avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Please provide an image'
            });
        }

        const user = await User.findById(req.user._id);
        user.profile.avatar = `/uploads/avatars/${req.file.filename}`;
        await user.save();

        res.json({
            success: true,
            data: {
                avatar: user.profile.avatar
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}, (error, req, res, next) => {
    res.status(400).json({
        success: false,
        error: error.message
    });
});

// Change password
router.post('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user._id);
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: 'Current password is incorrect'
            });
        }

        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Get user stats
router.get('/stats', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        res.json({
            success: true,
            data: {
                poemCredits: user.poemCredits,
                subscriptionPlan: user.subscriptionPlan,
                isEmailVerified: user.isEmailVerified,
                joinedDate: user.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error fetching user stats'
        });
    }
});

module.exports = router;