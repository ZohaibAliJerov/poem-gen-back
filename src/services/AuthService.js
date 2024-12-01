// src/services/AuthService.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
// const EmailService = require('./EmailService');

class AuthService {
  generateToken(user) {
    return jwt.sign(
      { 
        id: user._id,
        email: user.email,
        plan: user.subscriptionPlan 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async register(userData) {
    try {
      const { email, password, username, name } = userData;

      // Check if user exists
      const existingUser = await User.findOne({ 
        $or: [{ email }, { username }] 
      });
      
      if (existingUser) {
        throw new Error(
          existingUser.email === email 
            ? 'Email already registered' 
            : 'Username already taken'
        );
      }
      // Create verification token
      const verificationToken = this.generateVerificationToken();

      // Create user
      const user = await User.create({
        name: username,
        email,
        password,
        verificationToken
      });

    //   // Send verification email
    //   await EmailService.sendVerificationEmail(
    //     user.email, 
    //     verificationToken
    //   );

      // Generate JWT
      const token = this.generateToken(user);
      console.log('here 4')
      return {
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          isEmailVerified: user.isEmailVerified
        },
        token
      };
    } catch (error) {
      throw error;
    }
  }

  async login(email, password) {
    try {
      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check password
      const isValid = await user.comparePassword(password);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Generate token
      const token = this.generateToken(user);

      return {
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          isEmailVerified: user.isEmailVerified,
          subscriptionPlan: user.subscriptionPlan
        },
        token
      };
    } catch (error) {
      throw error;
    }
  }

  async verifyEmail(token) {
    try {
      const user = await User.findOne({ verificationToken: token });
      if (!user) {
        throw new Error('Invalid verification token');
      }

      user.isEmailVerified = true;
      user.verificationToken = undefined;
      await user.save();

      return {
        message: 'Email verified successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  async forgotPassword(email) {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('No account found with this email');
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();

      // Send reset email
      await EmailService.sendPasswordResetEmail(email, resetToken);

      return {
        message: 'Password reset instructions sent to email'
      };
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(token, newPassword) {
    try {
      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
      });

      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      user.password = newPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return {
        message: 'Password reset successful'
      };
    } catch (error) {
      throw error;
    }
  }

  async googleAuth({ email, name, googleId, picture }) {
    try {
        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            // Update existing user's Google info if needed
            if (!user.googleId) {
                user.googleId = googleId;
                user.profile.picture = picture;
                await user.save();
            }
        } else {
            // Create new user
            user = await User.create({
                email,
                name,
                googleId,
                profile: {
                    name,
                    picture
                },
                isEmailVerified: true, 
                password: crypto.randomBytes(32).toString('hex') 
            });
        }

        // Generate token
        const token = this.generateToken(user);

        return {
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                isEmailVerified: user.isEmailVerified,
                subscriptionPlan: user.subscriptionPlan,
                profile: user.profile
            },
            token
        };
    } catch (error) {
        throw new Error(`Google authentication failed: ${error.message}`);
    }
}
}

module.exports = new AuthService();