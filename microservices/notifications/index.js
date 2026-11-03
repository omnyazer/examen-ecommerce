const { logger } = require('./logger');
const { createTransport } = require('./transport');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const { createApp } = require('./app');

try {
  const enabled = process.env.NOTIFICATIONS_ENABLED === 'true';
  const transporter = enabled ? createTransport(process.env) : null;
  const app = createApp({
    transporter,
    sender:
      process.env.EMAIL_PROVIDER === 'brevo' ? process.env.EMAIL_FROM : process.env.EMAIL_USER,
    serviceToken: process.env.INTERNAL_SERVICE_TOKEN,
    enabled,
  });
  const port = process.env.PORT || process.env.NOTIFI_PORT || 4002;
  const server = app.listen(port, () => {
    logger.info(`Service de notification en écoute sur le port ${port}`);
    if (!enabled) logger.info('Envoi des mails désactivé');
  });
  server.on('error', () => {
    logger.error('Impossible de démarrer les notifications : vérifier le port.');
    process.exitCode = 1;
  });
} catch {
  logger.error('Impossible de démarrer les notifications : vérifier la configuration.');
  process.exitCode = 1;
}
