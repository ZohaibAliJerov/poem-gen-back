// src/utils/webhookTester.js
const crypto = require('crypto');
const axios = require('axios');

class WebhookTester {
    constructor(baseURL, webhookSecret) {
        this.baseURL = baseURL;
        this.webhookSecret = webhookSecret;
        this.testSubscriptionId = null;
        this.testCustomerId = null;
    }

    generateSignature(payload) {
        const ts = Math.floor(Date.now() / 1000);
        const payloadString = JSON.stringify(payload);
        console.log(this.webhookSecret,'testtest')
        const signature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(`${ts}:${payloadString}`)
            .digest('hex');
        return `ts=${ts},s=${signature}`;
    }

    async simulateWebhook(eventType, data) {
        const payload = {
            event_type: eventType,
            data: data,
            event_time: new Date().toISOString()
        };

        const signature = this.generateSignature(payload);

        try {
            console.log(`🚀 Simulating ${eventType}...`);
            const response = await axios.post(`${this.baseURL}/api/subscriptions/webhook`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'paddle-signature': signature
                }
            });
            console.log(`✅ ${eventType} simulation successful`);
            return response.data;
        } catch (error) {
            console.error(`❌ ${eventType} simulation failed:`, error.response?.data || error.message);
            throw error;
        }
    }

    async simulateSubscriptionActivated(userId, planType) {
        this.testSubscriptionId = `test_sub_${Date.now()}`;
        this.testCustomerId = `test_cust_${Date.now()}`;

        return this.simulateWebhook('subscription.activated', {
            subscription_id: this.testSubscriptionId,
            customer_id: this.testCustomerId,
            status: 'active',
            next_billed_amount: planType === 'monthly' ? 7 : 47,
            next_billed_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            billed_at: new Date().toISOString(),
            currency: 'USD',
            billing_period: planType === 'monthly' ? 'month' : 'year',
            custom_data: { 
                userId, 
                planType,
                subscriptionPlan: 'pro'
            }
        });
    }

    async simulateSubscriptionCanceled(subscriptionId = null) {
        return this.simulateWebhook('subscription.canceled', {
            subscription_id: subscriptionId || this.testSubscriptionId,
            status: 'canceled',
            effective_from: new Date().toISOString(),
            cancellation_reason: 'user_requested'
        });
    }

    async simulatePaymentSucceeded(subscriptionId = null) {
        return this.simulateWebhook('subscription.payment_succeeded', {
            subscription_id: subscriptionId || this.testSubscriptionId,
            payment_id: `test_payment_${Date.now()}`,
            amount: '7.00',
            currency: 'USD',
            status: 'completed',
            billed_at: new Date().toISOString(),
            receipt_url: 'https://sandbox-checkout.paddle.com/receipt/1234'
        });
    }

    async simulatePaymentFailed(subscriptionId = null) {
        return this.simulateWebhook('subscription.payment_failed', {
            subscription_id: subscriptionId || this.testSubscriptionId,
            payment_id: `test_payment_${Date.now()}`,
            amount: '7.00',
            currency: 'USD',
            status: 'failed',
            failure_reason: 'card_declined',
            next_retry_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            attempt_count: 1
        });
    }

    async simulateSubscriptionUpdated(subscriptionId = null, newPlanType = 'yearly') {
        return this.simulateWebhook('subscription.updated', {
            subscription_id: subscriptionId || this.testSubscriptionId,
            customer_id: this.testCustomerId,
            status: 'active',
            next_billed_amount: newPlanType === 'monthly' ? 7 : 47,
            next_billed_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            billing_period: newPlanType === 'monthly' ? 'month' : 'year',
            update_type: 'plan_change'
        });
    }
}

module.exports = WebhookTester;