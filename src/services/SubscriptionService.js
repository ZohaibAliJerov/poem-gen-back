const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

class SubscriptionService {
    constructor() {
        this.paddle  = new Paddle(process.env.PADDLE_API_KEY, {
             environment:  Environment.sandbox,
            // logLevel: 'verbose' // or 'error' for less verbose logging
          })

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
            // 1. Get user
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // 2. Get or create Paddle customer
            let customer;
            try {
                // First, try to find existing custome
                if (user.paddleCustomerId && user.paddleCustomerId != undefined) {
                    customer = user.paddleCustomerId
                } else {

                    // Create new customer if not found
                    const newCustomer = await this.paddle.customers.create({
                        email: user.email,
                        name: user.name || user.email
                    });
                    customer = newCustomer.id;
                    user.paddleCustomerId = newCustomer.id;
                    await user.save();

                }
            } catch (error) {
                console.error('Customer operation failed:', error);
                throw new Error('Failed to process customer information');
            }

            // 3. Get price ID based on plan type
            const planDetails = this.PLAN_DETAILS[planType];
            console.log(planDetails,'testfasdfasdfasdf')

            if (!planDetails || !planDetails.priceId) {
                throw new Error('Invalid plan type or price configuration');
            }

            // 4. Create transaction
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
                // 5. Return checkout details
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

    async handleSubscriptionActivated(data) {
        try {
            const { 
                subscription_id, 
                customer_id, 
                custom_data,
                next_billed_amount,
                next_billed_at,
                billed_at
            } = data;
            
            const { userId, planType } = custom_data;

            // Create or update subscription
            await Subscription.findOneAndUpdate(
                { subscriptionId: subscription_id },
                {
                    userId,
                    customerId: customer_id,
                    subscriptionId: subscription_id,
                    status: 'active',
                    planType,
                    nextBillAmount: next_billed_amount,
                    nextBillDate: new Date(next_billed_at),
                    lastBillDate: billed_at ? new Date(billed_at) : null
                },
                { upsert: true, new: true }
            );

            // Update user
            await User.findByIdAndUpdate(userId, {
                paddleSubscriptionId: subscription_id,
                subscriptionPlan: planType,
                poemCredits: -1 // Unlimited for pro plans
            });

        } catch (error) {
            console.error('Error handling subscription activation:', error);
            throw error;
        }
    }

    

    async handleSubscriptionUpdated(data) {
        try {
            const { 
                subscription_id,
                status,
                next_billed_amount,
                next_billed_at
            } = data;

            const subscription = await Subscription.findOne({ 
                subscriptionId: subscription_id 
            });

            if (subscription) {
                subscription.status = status;
                subscription.nextBillAmount = next_billed_amount;
                subscription.nextBillDate = new Date(next_billed_at);
                await subscription.save();
            }

        } catch (error) {
            console.error('Error handling subscription update:', error);
            throw error;
        }
    }

async testConnection() {
    try {
        const result = await this.paddle.prices.list();
        // const newCustomer = await this.paddle.products.list();
        // const customers = await this.paddle.prices.list({

        // });
        console.log('Paddle connection successful:', result, 'prices found');
        return true;
    } catch (error) {
        console.error('Paddle connection failed:', error);
        return false;
    }
}

    async handleSubscriptionCanceled(data) {
        try {
            const { subscription_id } = data;

            // Update subscription
            const subscription = await Subscription.findOne({ 
                subscriptionId: subscription_id 
            });

            if (subscription) {
                subscription.status = 'canceled';
                subscription.cancelAtPeriodEnd = true;
                await subscription.save();

                // Update user
                await User.findByIdAndUpdate(subscription.userId, {
                    subscriptionPlan: 'free',
                    poemCredits: 3 // Reset to free plan credits
                });
            }

        } catch (error) {
            console.error('Error handling subscription cancellation:', error);
            throw error;
        }
    }

    async handleWebhook(event) {
        try {
            switch (event.event_type) {
                case 'subscription.activated':
                    await this.handleSubscriptionActivated(event.data);
                    break;
                    
                case 'subscription.updated':
                    await this.handleSubscriptionUpdated(event.data);
                    break;
                    
                case 'subscription.canceled':
                    await this.handleSubscriptionCanceled(event.data);
                    break;
                    
                case 'subscription.payment_succeeded':
                    await this.handlePaymentSucceeded(event.data);
                    break;
            }
        } catch (error) {
            console.error('Webhook handling error:', error);
            throw error;
        }
    }

    async handlePaymentSucceeded(data) {
        try {
            const { subscription_id, billed_at } = data;

            await Subscription.findOneAndUpdate(
                { subscriptionId: subscription_id },
                { 
                    lastBillDate: new Date(billed_at),
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
}

module.exports = new SubscriptionService();