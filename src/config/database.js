const mongoose = require('mongoose');

// MongoDB connection options
const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 100,
  minPoolSize: 10,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  tlsCAFile: undefined,
};

// Connection events handlers
function handleConnection() {
  console.log('✅ Successfully connected to MongoDB.');
}

function handleError(error) {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
}

function handleDisconnect() {
  console.log('⚠️ MongoDB disconnected');
  // Attempt to reconnect
  connectDB();
}

// Main connection function
async function connectDB() {
  try {
    // Check if we already have a connection
    if (mongoose.connection.readyState === 1) {
      console.log('📊 MongoDB is already connected');
      return;
    }

    // Connect to MongoDB
    mongoose.connection.on('connected', handleConnection);
    mongoose.connection.on('error', handleError);
    mongoose.connection.on('disconnected', handleDisconnect);

    // Handle application termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
      } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
      }
    });

    await mongoose.connect(process.env.MONGODB_URI, options);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

module.exports = connectDB;