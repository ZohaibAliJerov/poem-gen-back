const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customerId: {
        type: String,
        required: true
    },
    subscriptionId: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'trialing', 'paused', 'canceled', 'past_due'],
        default: 'active'
    },
    planType: {
        type: String,
        enum: ['free', 'monthly', 'yearly'],
        required: true
    },
    nextBillAmount: {
        type: Number,
        required: false // Make this optional
    },
    nextBillDate: {
        type: Date,
        required: false // Make this optional since it can be null
    },
    lastBillDate: {
        type: Date,
        required: false
    },
    pauseCollection: {
        type: Boolean,
        default: false
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    scheduledCancellationDate: {
      type: Date,
      required: false
  },
    currentPeriod: {
        startsAt: Date,
        endsAt: Date
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true }
});
subscriptionSchema.pre('findOneAndUpdate', function(next) {
  console.log('Update operation:', {
      query: this.getQuery(),
      update: this.getUpdate()
  });
  next();
}); 

// Add a virtual property to check if subscription is ending soon
subscriptionSchema.virtual('isEndingSoon').get(function() {
  if (this.cancelAtPeriodEnd && this.scheduledCancellationDate) {
      const now = new Date();
      const daysUntilCancellation = Math.ceil(
          (this.scheduledCancellationDate - now) / (1000 * 60 * 60 * 24)
      );
      return daysUntilCancellation <= 7; // Return true if 7 or fewer days left
  }
  return false;
});

module.exports = mongoose.model('Subscription', subscriptionSchema);