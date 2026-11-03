const { logger } = require('./logger');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Checkout = require('./models/Checkout');
const { createApp } = require('./app');
const { startRecovery } = require('./services/checkoutService');

async function start() {
  if (
    process.env.NODE_ENV === 'production' &&
    (Buffer.byteLength(process.env.JWT_SECRET || '') < 32 ||
      Buffer.byteLength(process.env.INTERNAL_SERVICE_TOKEN || '') < 32 ||
      !/^https:\/\/[^/]+$/.test(process.env.FRONTEND_ORIGIN || ''))
  ) {
    throw new Error('Secrets de production ou origine HTTPS non configurés.');
  }
  await connectDB();
  await Checkout.init();
  const stopRecovery = startRecovery();
  const port = process.env.PORT || 5000;
  const server = createApp().listen(port, () =>
    logger.info(`Serveur en écoute sur le port ${port}`)
  );
  server.on('error', async () => {
    await stopRecovery();
    logger.error('Impossible de démarrer le backend : vérifier le port.');
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

start().catch(async () => {
  logger.error(
    'Impossible de démarrer le backend : vérifier la base de données et la configuration.'
  );
  await mongoose.disconnect();
  process.exitCode = 1;
});
