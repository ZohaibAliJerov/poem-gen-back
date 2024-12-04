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
            if (!rawBody) {
                throw new Error('Missing webhook body');
            }
            if (!signature) {
                throw new Error('Missing Paddle signature');
            }
            if (!process.env.PADDLE_WEBHOOK_SECRET) {
                throw new Error('Paddle webhook secret not configured');
            }
    
            // Log incoming webhook attempt
            console.log('Processing webhook:', {
                signaturePresent: !!signature,
                bodyLength: rawBody.length,
                timestamp: new Date().toISOString()
            });
    
            // Convert body to string if it's a buffer
            const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    
            // Unmarshal and verify the webhook
            const eventData = this.paddle.webhooks.unmarshal(
                bodyString,
                process.env.PADDLE_WEBHOOK_SECRET,
                signature
            );
    
            // Log successful verification
            console.log('Webhook verified successfully:', {
                eventType: eventData.eventType,
                timestamp: new Date().toISOString()
            });
    
            // Process based on event type
            switch (eventData.eventType) {
                case 'subscription.created':
                case 'subscription.activated':
                    await this.handleSubscriptionActivated(eventData.data);
                    console.log(`Handled subscription activation for ID: ${eventData.data.id}`);
                    break;
    
                case 'subscription.updated':
                    await this.handleSubscriptionUpdated(eventData.data);
                    console.log(`Handled subscription update for ID: ${eventData.data.id}`);
                    break;
    
                case 'subscription.canceled':
                    await this.handleSubscriptionCanceled(eventData.data);
                    console.log(`Handled subscription cancellation for ID: ${eventData.data.id}`);
                    break;
    
                case 'subscription.paused':
                    await this.handleSubscriptionPaused(eventData.data);
                    console.log(`Handled subscription pause for ID: ${eventData.data.id}`);
                    break;
    
                case 'subscription.resumed':
                    await this.handleSubscriptionResumed(eventData.data);
                    console.log(`Handled subscription resume for ID: ${eventData.data.id}`);
                    break;
    
                case 'subscription.past_due':
                    await this.handleSubscriptionPastDue(eventData.data);
                    console.log(`Handled subscription past due for ID: ${eventData.data.id}`);
                    break;
    
                case 'transaction.billed':
                    await this.handlePaymentSucceeded(eventData.data);
                    console.log(`Handled successful payment for transaction ID: ${eventData.data.id}`);
                    break;
    
                default:
                    console.log(`Received unhandled webhook event type: ${eventData.eventType}`, {
                        eventId: eventData.id,
                        timestamp: new Date().toISOString()
                    });
                    // Don't throw error for unhandled events, just log them
                    return;
            }
    
            // Log successful processing
            console.log('Successfully processed webhook:', {
                eventType: eventData.eventType,
                eventId: eventData.id,
                timestamp: new Date().toISOString()
            });
    
        } catch (error) {
            // Enhanced error logging
            console.error('Webhook processing failed:', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
                errorType: error.name,
                // Add additional context if available
                details: error.details || 'No additional details'
            });
    
            // Rethrow the error for the route handler to catch
            throw new Error(`Webhook processing failed: ${error.message}`);
        }
    }

    async handleSubscriptionActivated(data) {
        try {
            const { 
                id: subscription_id,
                customer: { id: customer_id },
                custom_data,
                next_billing_amount,
                current_period_end,
                current_period_start
            } = data;
            
            const { userId, planType } = custom_data;

            await Subscription.findOneAndUpdate(
                { subscriptionId: subscription_id },
                {
                    userId,
                    customerId: customer_id,
                    subscriptionId: subscription_id,
                    status: 'active',
                    planType,
                    nextBillAmount: next_billing_amount,
                    nextBillDate: new Date(current_period_end),
                    lastBillDate: new Date(current_period_start)
                },
                { upsert: true, new: true }
            );

            await User.findByIdAndUpdate(userId, {
                paddleSubscriptionId: subscription_id,
                subscriptionPlan: planType,
                poemCredits: -1
            });
        } catch (error) {
            console.error('Error handling subscription activation:', error);
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