const WebhookTester = require('../utils/webhookTester');
require('dotenv').config();

const webhookTester = new WebhookTester(
    'http://localhost:3000',
    process.env.PADDLE_WEBHOOK_SECRET
);

async function testSubscriptionFlow() {
    console.log('🏃‍♂️ Starting subscription flow test...\n');

    try {
        // Test user ID (replace with actual test user ID from your database)
        const userId = '6744c5cbecaed31affe09cfd';

        // 1. Activate subscription
        console.log('1️⃣ Testing subscription activation...');
        const activationResult = await webhookTester.simulateSubscriptionActivated(
            userId,
            'monthly'
        );
        console.log('Activation successful!\n');

        // 2. Simulate successful payment
        console.log('2️⃣ Testing payment success...');
        await webhookTester.simulatePaymentSucceeded();
        console.log('Payment successful!\n');

        // 3. Simulate plan upgrade
        console.log('3️⃣ Testing plan upgrade...');
        await webhookTester.simulateSubscriptionUpdated(null, 'yearly');
        console.log('Plan upgrade successful!\n');

        // 4. Simulate failed payment
        console.log('4️⃣ Testing payment failure...');
        await webhookTester.simulatePaymentFailed();
        console.log('Payment failure test successful!\n');

        // 5. Simulate subscription cancellation
        console.log('5️⃣ Testing subscription cancellation...');
        await webhookTester.simulateSubscriptionCanceled();
        console.log('Cancellation successful!\n');

        console.log('✅ All tests completed successfully!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    }
}

// Run the tests
console.log('🔧 Webhook Test Environment');
console.log('------------------------');
console.log(`API URL: ${process.env.API_URL || 'http://localhost:3001'}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('------------------------\n');

testSubscriptionFlow();