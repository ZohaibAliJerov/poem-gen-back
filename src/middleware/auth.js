const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'Please login to continue'
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            
            if (!user) {
                return res.status(401).json({ 
                    error: 'Invalid token',
                    message: 'User not found'
                });
            }

            req.user = user;
            next();
            
        } catch (error) {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'Please login again'
            });
        }
    } catch (error) {
        res.status(500).json({ 
            error: 'Server error',
            message: 'Authentication failed'
        });
    }
};

const checkEmailVerification = async (req, res, next) => {
    if (!req.user.isEmailVerified) {
        return res.status(403).json({ 
            error: 'Email not verified',
            message: 'Please verify your email to continue'
        });
    }
    next();
};

module.exports = { auth, checkEmailVerification };