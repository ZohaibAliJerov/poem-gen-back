const app = require('./app');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
    console.log(`
🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}
👉 http://localhost:${PORT}
    `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
    // Close server & exit process
    server.close(() => process.exit(1));
});

// Export the Express API
module.exports = app;