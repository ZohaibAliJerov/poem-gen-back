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
// Update the handleSubscriptionActivated method in SubscriptionService
async handleSubscriptionActivated(data) {
    try {
        // Log the incoming data
        console.log('Processing subscription activation:', {
            data: JSON.stringify(data, null, 2)
        });

        // Validate the data
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid subscription data received');
        }

        const { 
            id: subscription_id, 
            customer_id,
            status,
            next_billed_at,
            current_billing_period,
            billing_cycle,
            custom_data
        } = data;

        // Validate required fields
        if (!subscription_id) {
            throw new Error('Missing subscription ID');
        }

        // Create or update subscription
        await Subscription.findOneAndUpdate(
            { subscriptionId: subscription_id },
            {
                userId: custom_data?.userId || customer_id, // Fallback to customer_id if userId not in custom_data
                customerId: customer_id,
                subscriptionId: subscription_id,
                status: status || 'active',
                nextBillDate: next_billed_at ? new Date(next_billed_at) : null,
                currentPeriod: current_billing_period ? {
                    starts_at: new Date(current_billing_period.starts_at),
                    ends_at: new Date(current_billing_period.ends_at)
                } : null,
                billingCycle: billing_cycle ? {
                    interval: billing_cycle.interval,
                    frequency: billing_cycle.frequency
                } : null
            },
            { upsert: true, new: true }
        );

        // Update user subscription status if we have a userId
        if (custom_data?.userId) {
            await User.findByIdAndUpdate(custom_data.userId, {
                subscriptionPlan: 'pro',
                poemCredits: -1, // Unlimited credits for pro users
                paddleCustomerId: customer_id,
                paddleSubscriptionId: subscription_id
            });
        }

        console.log(`Successfully activated subscription: ${subscription_id}`);

    } catch (error) {
        console.error('Subscription activation error:', {
            error: error.message,
            stack: error.stack,
            data: data
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