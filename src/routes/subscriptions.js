// src/routes/subscriptions.js
const express = require('express');
const router = express.Router();
const { Request, Response } = require('express');
const SubscriptionService = require('../services/SubscriptionService');
const { auth } = require('../middleware/auth'); // Correct import
// const { validateWebhook } = require('@paddle/paddle-node-sdk');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const Poem = require('../models/Poem');

const paddle = new Paddle(process.env.PADDLE_API_KEY || '',{
        environment: Environment.sandbox
});

// Handle Paddle webhooks (public route)
router.post('/webhook', 
    express.raw({ type: 'application/json' }), 
    async (req, res) => {
        try {
            const signature = req.headers['paddle-signature'] || '';
            
            // Convert Buffer to string and ensure it's valid JSON
            let rawRequestBody = '';
            if (Buffer.isBuffer(req.body)) {
                rawRequestBody = req.body.toString('utf8');
            } else if (typeof req.body === 'string') {
                rawRequestBody = req.body;
            } else {
                rawRequestBody = JSON.stringify(req.body);
            }
            console.log(rawRequestBody,'new complete body')
            console.log('Debug request body:', {
                bodyType: typeof rawRequestBody,
                bodyLength: rawRequestBody.length,
                bodyPreview: rawRequestBody.substring(0, 100)
            });

            // Validate JSON
            try {
                JSON.parse(rawRequestBody);
            } catch (e) {
                console.error('JSON Parse Error:', e);
                console.log('Raw body received:', rawRequestBody);
                return res.status(400).send('Invalid JSON format');
            }

            const secretKey = process.env.PADDLE_WEBHOOK_SECRET || '';

            // Verify and process webhook
            const eventData = paddle.webhooks.unmarshal(
                rawRequestBody,
                secretKey,
                signature
            );

            console.log('Successfully verified webhook:', eventData.eventType);

            // Process based on event type
            switch (eventData.eventType) {
                case 'subscription.created':
                case 'subscription.activated':
                    await SubscriptionService.handleSubscriptionActivated(eventData.data);
                    break;

                case 'subscription.updated':
                    await SubscriptionService.handleSubscriptionUpdated(eventData.data);
                    break;

                case 'subscription.canceled':
                    await SubscriptionService.handleSubscriptionCanceled(eventData.data);
                    break;

                case 'subscription.paused':
                    await SubscriptionService.handleSubscriptionPaused(eventData.data);
                    break;

                case 'subscription.resumed':
                    await SubscriptionService.handleSubscriptionResumed(eventData.data);
                    break;

                case 'subscription.past_due':
                    await SubscriptionService.handleSubscriptionPastDue(eventData.data);
                    break;

                case 'transaction.billed':
                    await SubscriptionService.handlePaymentSucceeded(eventData.data);
                    break;

                default:
                    console.log(`Unhandled event type: ${eventData.eventType}`);
            }

            res.send('Processed webhook event');

        } catch (error) {
            console.error('Webhook Error:', {
                message: error.message,
                body: req.body,
                signature: req.headers['paddle-signature']
            });
            res.status(400).send('Webhook processing failed');
        }
    }
);
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