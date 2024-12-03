// models/RateLimit.js
const mongoose = require('mongoose');

const RateLimitSchema = new mongoose.Schema({
  ip: { 
    type: String, 
    required: true, 
    index: true 
  },
  requests: [{
    timestamp: { type: Date, default: Date.now }
  }],
  lastRequest: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Create a TTL index to automatically remove documents after 24 hours
RateLimitSchema.index({ lastRequest: 1 }, { expireAfterSeconds: 86400 }); // 24 hours

// Method to check if rate limit is exceeded
RateLimitSchema.methods.isRateLimited = function(limit = 10, windowHrs = 24) {
  const windowMs = windowHrs * 60 * 60 * 1000;
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Filter requests within the time window
  const validRequests = this.requests.filter(req => 
    req.timestamp.getTime() > windowStart
  );

  return validRequests.length >= limit;
};

// Static method to track and check rate limit
RateLimitSchema.statics.checkRateLimit = async function(ip, limit = 10, windowHrs = 24) {
  const windowMs = windowHrs * 60 * 60 * 1000;
  const now = new Date();
  const windowStart = new Date(now - windowMs);

  try {
    // Find or create rate limit document
    let rateLimit = await this.findOne({ ip });
    
    if (!rateLimit) {
      rateLimit = new this({
        ip,
        requests: [{ timestamp: now }],
        lastRequest: now
      });
      await rateLimit.save();
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: new Date(now.getTime() + windowMs)
      };
    }

    // Clean up old requests
    rateLimit.requests = rateLimit.requests.filter(req => 
      req.timestamp.getTime() > windowStart.getTime()
    );

    // Check if rate limited
    if (rateLimit.requests.length >= limit) {
      const oldestRequest = rateLimit.requests[0].timestamp;
      const resetTime = new Date(oldestRequest.getTime() + windowMs);
      
      return {
        allowed: false,
        remaining: 0,
        resetTime
      };
    }

    // Add new request
    rateLimit.requests.push({ timestamp: now });
    rateLimit.lastRequest = now;
    await rateLimit.save();

    return {
      allowed: true,
      remaining: limit - rateLimit.requests.length,
      resetTime: new Date(now.getTime() + windowMs)
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // If there's an error, allow the request but log the error
    return { allowed: true, remaining: 0 };
  }
};

const RateLimit = mongoose.model('RateLimit', RateLimitSchema);
module.exports = RateLimit;