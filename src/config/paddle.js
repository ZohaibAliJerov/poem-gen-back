const { Paddle } = require('@paddle/paddle-node-sdk');

const paddle = new Paddle({
  apiKey: process.env.PADDLE_API_KEY,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
});

module.exports = paddle;