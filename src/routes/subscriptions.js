// src/routes/subscriptions.js
const express = require('express');
const router = express.Router();
const SubscriptionService = require('../services/SubscriptionService');
const { auth } = require('../middleware/auth'); // Correct import
// const { validateWebhook } = require('@paddle/paddle-node-sdk');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Poem = require('../models/Poem');

// Handle Paddle webhooks (public route)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        // Get the Paddle signature from headers
        const signature = req.headers['paddle-signature'];
        
        if (!signature) {
            console.error('No Paddle signature found in webhook request');
            return res.status(400).json({ error: 'Missing Paddle signature' });
        }

        // Convert raw body to string if it's a buffer
        const rawBody = req.body instanceof Buffer ? req.body.toString() : req.body;

        // Log the incoming webhook data for debugging
        console.log('Webhook Headers:', req.headers);
        console.log('Webhook Body:', rawBody);
        console.log('Webhook Signature:', signature);
        
        // Verify webhook and process it
        await SubscriptionService.handleWebhook(rawBody, signature);

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Protected routes - apply auth middleware
router.use(auth);

// Create checkout session
router.post('/create-session', async (req, res) => {
    try {
        const { planType } = req.body;
        const session = await SubscriptionService.createCheckoutSession(
            req.user._id,
            planType
        );
        res.json(session);
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});
router.get('/test-connection', async (req, res) => {
    const subscriptionService = require('../services/SubscriptionService');
    const result = await subscriptionService.testConnection();
    res.json({ success: result });
});

// Get current subscription
router.get('/current', async (req, res) => {
    try {
        const subscription = await SubscriptionService.getCurrentSubscription(req.user._id);
        res.json(subscription || { plan: 'free' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Get subscription details
router.get('/details', async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            userId: req.user._id,
            status: { $in: ['active', 'trialing'] }
        }).lean();

        if (!subscription) {
            return res.json({
                plan: 'free',
                credits: req.user.poemCredits
            });
        }

        const user = await User.findById(req.user._id);
        
        res.json({
            ...subscription,
            credits: user.poemCredits,
            features: getFeaturesByPlan(subscription.planType)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get subscription usage
router.get('/usage', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const poems = await Poem.find({
            userId: req.user._id,
            createdAt: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        });

        res.json({
            total: poems.length,
            byDate: groupPoemsByDate(poems),
            byType: groupPoemsByType(poems)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update subscription plan
router.post('/update', async (req, res) => {
    try {
        const { planType } = req.body;
        const subscription = await SubscriptionService.updateSubscription(
            req.user._id,
            planType
        );
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel subscription
router.post('/cancel', async (req, res) => {
    try {
        const subscription = await SubscriptionService.cancelSubscription(
            req.user._id
        );
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Resume canceled subscription
router.post('/resume', async (req, res) => {
    try {
        const subscription = await SubscriptionService.resumeSubscription(
            req.user._id
        );
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get billing history
router.get('/billing-history', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const subscription = await Subscription.findOne({
            userId: req.user._id
        });

        if (!subscription) {
            return res.json({ transactions: [] });
        }

        const transactions = await SubscriptionService.getBillingHistory(
            subscription.subscriptionId,
            page,
            limit
        );

        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/portal', async (req, res) => {
    try {
        const userId = req.user.id; // Assuming your auth middleware adds user to req
        const portalSession = await SubscriptionService.createCustomerPortalSession(userId);
        res.json(portalSession);
    } catch (error) {
        console.error('Portal session creation error:', error);
        res.status(500).json({ 
            error: true, 
            message: 'Failed to create portal session'
        });
    }
});

// Update payment method
router.post('/update-payment', async (req, res) => {
    try {
        const { paymentMethodId } = req.body;
        const result = await SubscriptionService.updatePaymentMethod(
            req.user._id,
            paymentMethodId
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Utility functions
function getFeaturesByPlan(planType) {
    const features = {
        free: {
            poemLimit: 3,
            storage: 5,
            templates: 'basic'
        },
        pro: {
            poemLimit: -1, // unlimited
            storage: -1, // unlimited
            templates: 'all',
            prioritySupport: true,
            customThemes: true,
            analytics: true
        }
    };

    return features[planType] || features.free;
}

function groupPoemsByDate(poems) {
    return poems.reduce((acc, poem) => {
        const date = poem.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {});
}

function groupPoemsByType(poems) {
    return poems.reduce((acc, poem) => {
        acc[poem.type] = (acc[poem.type] || 0) + 1;
        return acc;
    }, {});
}

module.exports = router;