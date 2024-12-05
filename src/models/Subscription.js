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
    currentPeriod: {
        startsAt: Date,
        endsAt: Date
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);