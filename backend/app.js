const express = require('express');
const path = require('node:path');
const mongoose = require('mongoose');
const { browserSecurity } = require('./middlewares/browserSecurity');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.use(browserSecurity(process.env.FRONTEND_ORIGIN || 'http://localhost:3002'));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/products', require('./routes/productRoutes'));
  app.use('/api/orders', require('./routes/orderRoutes'));
  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/admin', require('./routes/adminRoutes'));
  if (process.env.SERVE_FRONTEND === 'true') {
    const frontendPath = path.join(__dirname, '../frontend/build');
    app.use(express.static(frontendPath));
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
