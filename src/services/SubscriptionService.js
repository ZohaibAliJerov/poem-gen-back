const { Paddle, Environment, EventType } = require('@paddle/paddle-node-sdk');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

class SubscriptionService {
    constructor() {
        this.paddle = new Paddle(process.env.PADDLE_API_KEY, {
            environment: Environment.sandbox
        });

        this.PLAN_DETAILS = {
            monthly: {
                name: 'Monthly Plan',
                price: 7,
                type: 'pro',
                priceId: process.env.PADDLE_PRO_MONTHLY_PRICE_ID,
                credits: -1 // Unlimited
            },
            yearly: {
                name: 'Yearly Plan',
                price: 47,
                type: 'pro',
                priceId: process.env.PADDLE_PRO_YEARLY_PRICE_ID,
                credits: -1 // Unlimited
            }
        };
    }

    async createCheckoutSession(userId, planType) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            let customer;
            try {
                if (user.paddleCustomerId) {
                    customer = user.paddleCustomerId;
                } else {
                    const newCustomer = await this.paddle.customers.create({
                        email: user.email,
                        name: user.name || user.email
                    });
                    customer = newCustomer.data.id;
                    user.paddleCustomerId = newCustomer.data.id;
                    await user.save();
                }
            } catch (error) {
                console.error('Customer operation failed:', error);
                throw new Error('Failed to process customer information');
            }

            const planDetails = this.PLAN_DETAILS[planType];
            if (!planDetails || !planDetails.priceId) {
                throw new Error('Invalid plan type or price configuration');
            }

            try {
                const transaction = await this.paddle.transactions.create({
                    items: [{
                        priceId: planDetails.priceId,
                        quantity: 1
                    }],
                    returnUrl: `${process.env.FRONTEND_URL}/dashboard/subscription?success=true`,
                    cancelUrl: `${process.env.FRONTEND_URL}/dashboard/subscription`,
                    customerId: customer,
                    currencyCode: 'USD',
                    customData: {
                        userId: userId.toString(),
                        planType: planType
                    }
                });

                return {
                    clientSecret: transaction.clientSecret,
                    customerId: customer,
                    transactionId: transaction.id
                };
            } catch (error) {
                console.error('Transaction creation failed:', error);
                throw new Error('Failed to create checkout session');
            }
        } catch (error) {
            console.error('Checkout session creation failed:', error);
            throw error;
        }
    }

    async handleWebhook(rawBody, signature) {
        try {
            // Input validation
            if (!rawBody || !signature) {
                console.error('Missing required webhook parameters:', {
                    hasBody: !!rawBody,
                    hasSignature: !!signature
                });
                throw new Error('Missing required webhook parameters');
            }
    
            // Parse the body if it's a string
            const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
            
            // Log incoming webhook data for debugging
            console.log('Processing webhook:', {
                signatureHeader: signature,
                bodyPreview: bodyString.substring(0, 100)
            });
    
            // Verify and unmarshal the webhook
            const eventData = this.paddle.webhooks.unmarshal(
                bodyString,
                process.env.PADDLE_WEBHOOK_SECRET,
                signature
            );
    
            // Extract subscription details
            const {
                data,
                event_type: eventType
            } = eventData;
    
            console.log('Webhook verified, processing event:', eventType);
    
            switch (eventType) {
                case 'subscription.created':
                    await this.handleSubscriptionActivated({
                        id: data.id,
                        customer_id: data.customer_id,
                        status: data.status,
                        next_billed_at: data.next_billed_at,
                        custom_data: data.custom_data,
                        billing_cycle: data.billing_cycle,
                        currency_code: data.currency_code,
                        current_period: data.current_billing_period
                    });
                    break;
    
                case 'subscription.activated':
                    await this.handleSubscriptionActivated({
                        id: data.id,
                        customer_id: data.customer_id,
                        status: data.status,
                        next_billed_at: data.next_billed_at,
                        custom_data: data.custom_data,
                        billing_cycle: data.billing_cycle,
                        currency_code: data.currency_code,
                        current_period: data.current_billing_period
                    });
                    break;
    
                case 'subscription.updated':
                    await this.handleSubscriptionUpdated({
                        id: data.id,
                        status: data.status,
                        next_billed_at: data.next_billed_at,
                        current_period: data.current_billing_period
                    });
                    break;
    
                case 'subscription.canceled':
                    await this.handleSubscriptionCanceled({
                        id: data.id,
                        canceled_at: data.canceled_at
                    });
                    break;
    
                case 'subscription.paused':
                    await this.handleSubscriptionPaused({
                        id: data.id,
                        paused_at: data.paused_at
                    });
                    break;
    
                case 'subscription.resumed':
                    await this.handleSubscriptionResumed({
                        id: data.id,
                        status: data.status
                    });
                    break;
    
                case 'subscription.past_due':
                    await this.handleSubscriptionPastDue({
                        id: data.id,
                        status: data.status
                    });
                    break;
    
                case 'transaction.billed':
                    await this.handlePaymentSucceeded({
                        subscription_id: data.subscription_id,
                        effective_from: data.billing_period?.starts_at
                    });
                    break;
    
                default:
                    console.log(`Unhandled webhook event type: ${eventType}`);
            }
    
            // Log successful processing
            console.log('Successfully processed webhook:', {
                eventType,
                subscriptionId: data.id,
                timestamp: new Date().toISOString()
            });
    
        } catch (error) {
            console.error('Webhook processing failed:', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
    async handleSubscriptionActivated(data) {
        try {
            // Parse data if it's a string
            const subscriptionData = typeof data === 'string' ? JSON.parse(data) : data;
    
            console.log('Processing subscription data:', {
                id: subscriptionData.id,
                customerId: subscriptionData.customerId,
                items: subscriptionData.items
            });
    
            // Extract price information from items
            const subscriptionItem = subscriptionData.items[0];
            const priceId = subscriptionItem?.price?.id;
    
            // Determine plan type based on price ID
            let planType;
            switch (priceId) {
                case process.env.PADDLE_PRO_MONTHLY_PRICE_ID:
                    planType = 'monthly';
                    break;
                case process.env.PADDLE_PRO_YEARLY_PRICE_ID:
                    planType = 'yearly';
                    break;
                default:
                    planType = 'free';
                    console.log(`Unknown price ID: ${priceId}`);
            }
    
            console.log('Determined plan type:', {
                priceId,
                planType,
                monthlyPriceId: process.env.PADDLE_PRO_MONTHLY_PRICE_ID,
                yearlyPriceId: process.env.PADDLE_PRO_YEARLY_PRICE_ID
            });
    
            // Create subscription record
            const subscriptionUpdate = {
                subscriptionId: subscriptionData.id,
                customerId: subscriptionData.customerId,
                status: subscriptionData.status,
                planType: planType,
                nextBillAmount: parseFloat(subscriptionItem?.price?.unitPrice?.amount) / 100,
                nextBillDate: new Date(subscriptionData.nextBilledAt),
                lastBillDate: subscriptionData.firstBilledAt ? new Date(subscriptionData.firstBilledAt) : null,
                pauseCollection: false,
                cancelAtPeriodEnd: false
            };
    
            // Find user by customerId
            const user = await User.findOne({ paddleCustomerId: subscriptionData.customerId });
            
            if (!user) {
                console.error('No user found for customer ID:', subscriptionData.customerId);
                throw new Error('User not found');
            }
    
            // Add userId to subscription update
            subscriptionUpdate.userId = user._id;
    
            // Create or update subscription
            const subscription = await Subscription.findOneAndUpdate(
                { subscriptionId: subscriptionData.id },
                subscriptionUpdate,
                { upsert: true, new: true }
            );
    
            // Update user's subscription status
            const isPremium = planType === 'monthly' || planType === 'yearly';
            await User.findByIdAndUpdate(user._id, {
                subscriptionPlan: planType,
                poemCredits: isPremium ? -1 : 3, // -1 for unlimited credits
                paddleCustomerId: subscriptionData.customerId,
                paddleSubscriptionId: subscriptionData.id
            });
    
            console.log('Subscription activated successfully:', {
                subscriptionId: subscription.subscriptionId,
                userId: subscription.userId,
                planType: subscription.planType,
                isPremium
            });
    
            return subscription;
        } catch (error) {
            console.error('Error in handleSubscriptionActivated:', {
                error: error.message,
                stack: error.stack,
                data: typeof data === 'string' ? data.substring(0, 200) : 'Non-string data'
            });
            throw error;
        }
    }

    async handleSubscriptionUpdated(data) {
        try {
            const { 
                id: subscription_id,
                status,
                next_billing_amount,
                current_period_end
            } = data;

            await Subscription.findOneAndUpdate(
                { subscriptionId: subscription_id },
                {
                    status,
                    nextBillAmount: next_billing_amount,
                    nextBillDate: new Date(current_period_end)
                }
            );
        } catch (error) {
            console.error('Error handling subscription update:', error);
            throw error;
        }
    }

    async handleSubscriptionCanceled(data) {
        try {
            const { id: subscription_id } = data;

            const subscription = await Subscription.findOneAndUpdate(
                { subscriptionId: subscription_id },
                {
                    status: 'canceled',
                    cancelAtPeriodEnd: true
                }
            );

            if (subscription) {
                await User.findByIdAndUpdate(subscription.userId, {
                    subscriptionPlan: 'free',
                    poemCredits: 3
                });
            }
        } catch (error) {
            console.error('Error handling subscription cancellation:', error);
            throw error;
        }
    }

    async handlePaymentSucceeded(data) {
        try {
            const { 
                subscription: { id: subscription_id },
                effective_from
            } = data;

            await Subscription.findOneAndUpdate(
                { subscriptionId: subscription_id },
                { 
                    lastBillDate: new Date(effective_from),
                    status: 'active'
                }
            );
        } catch (error) {
            console.error('Error handling payment success:', error);
            throw error;
        }
    }

    async getCurrentSubscription(userId) {
        try {
            return await Subscription.findOne({ 
                userId, 
                status: { $in: ['active', 'trialing'] } 
            });
        } catch (error) {
            console.error('Error getting subscription:', error);
            throw error;
        }
    }

    async createCustomerPortalSession(userId) {
        try {
            const user = await User.findById(userId);
            if (!user || !user.paddleCustomerId) {
                throw new Error('User not found or no Paddle customer ID');
            }

            const subscription = await Subscription.findOne({ 
                userId, 
                status: { $in: ['active', 'trialing'] } 
            });

            if (!subscription) {
                throw new Error('No active subscription found');
            }

            const portalSession = await this.paddle.customers.createPortalSession({
                customerId: user.paddleCustomerId,
                subscriptionId: subscription.subscriptionId
            });

            return {
                cancelUrl: portalSession.data.url
            };
        } catch (error) {
            console.error('Error creating customer portal session:', error);
            throw error;
        }
    }

    // Add new handlers for the additional subscription states

async handleSubscriptionPaused(data) {
    try {
        const { id: subscription_id } = data;

        await Subscription.findOneAndUpdate(
            { subscriptionId: subscription_id },
            { 
                status: 'paused'
            }
        );
    } catch (error) {
        console.error('Error handling subscription pause:', error);
        throw error;
    }
}

async handleSubscriptionResumed(data) {
    try {
        const { id: subscription_id } = data;

        await Subscription.findOneAndUpdate(
            { subscriptionId: subscription_id },
            { 
                status: 'active'
            }
        );
    } catch (error) {
        console.error('Error handling subscription resume:', error);
        throw error;
    }
}

async handleSubscriptionPastDue(data) {
    try {
        const { id: subscription_id } = data;

        await Subscription.findOneAndUpdate(
            { subscriptionId: subscription_id },
            { 
                status: 'past_due'
            }
        );

        // Optionally notify the user about the past due payment
    } catch (error) {
        console.error('Error handling subscription past due:', error);
        throw error;
    }
}


    async testConnection() {
        try {
            const result = await this.paddle.prices.list();
            console.log('Paddle connection successful:', result.data.length, 'prices found');
            return true;
        } catch (error) {
            console.error('Paddle connection failed:', error);
            return false;
        }
    }
}

module.exports = new SubscriptionService();