const WebhookTester = require('../utils/webhookTester');

const webhookTester = new WebhookTester(
    'http://localhost:3000',
    process.env.PADDLE_WEBHOOK_SECRET
);

async function testSubscriptionFlow() {
    try {
        // Simulate new subscription
        await webhookTester.simulateSubscriptionActivated(
            'user_id_here',
            'monthly'
        );

        // Simulate successful payment
        await webhookTester.simulatePaymentSucceeded(
            'subscription_id_here'
        );

        // Simulate cancellation
        await webhookTester.simulateSubscriptionCanceled(
            'subscription_id_here'
        );
    } catch (error) {
        console.error('Test failed:', error);
    }
}