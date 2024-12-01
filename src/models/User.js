const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String, 
    trim: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  googleId: String,
  profile: {
    name: String,
    avatar: String,
    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return /^\+?[\d\s-]+$/.test(v);
        },
        message: 'Please enter a valid phone number'
      }
    },
    bio: {
      type: String,
      maxLength: 500
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say']
    },
    location: {
      country: String,
      city: String,
      timezone: String
    },
    website: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
        },
        message: 'Please enter a valid URL'
      }
    },
    socialLinks: {
      twitter: String,
      facebook: String,
      instagram: String,
      linkedin: String
    },
    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true
      },
      newsletter: {
        type: Boolean,
        default: true
      },
      language: {
        type: String,
        default: 'en'
      },
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
      }
    }
  },
  subscriptionPlan: {
    type: String,
    enum: ['free', 'pro'],
    default: 'free'
  },
  paddleSubscriptionId: String,
  paddleCustomerId: String,

  poemCredits: {
    type: Number,
    default: 30
  }
}, { 
  timestamps: true 
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);