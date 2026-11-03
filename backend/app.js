const express = require('express');
const { browserSecurity } = require('./middlewares/browserSecurity');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

function createApp() {
  const app = express();
  app.use(browserSecurity(process.env.FRONTEND_ORIGIN || 'http://localhost:3002'));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/products', require('./routes/productRoutes'));
  app.use('/api/orders', require('./routes/orderRoutes'));
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/admin', require('./routes/adminRoutes'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
