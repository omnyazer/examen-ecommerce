const nodemailer = require('nodemailer');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const { createApp } = require('./app');

try {
  const enabled = process.env.NOTIFICATIONS_ENABLED === 'true';
  if (enabled && (!process.env.EMAIL_USER || !process.env.EMAIL_APPLICATION_PASSWORD)) {
    throw new Error('Configuration SMTP incomplète');
  }
  const transporter = enabled
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APPLICATION_PASSWORD },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      })
    : null;
  const app = createApp({
    transporter,
    sender: process.env.EMAIL_USER,
    serviceToken: process.env.INTERNAL_SERVICE_TOKEN,
    enabled,
  });
  const port = process.env.PORT || process.env.NOTIFI_PORT || 4002;
  const server = app.listen(port, () => {
    console.log(`Service de notification en écoute sur le port ${port}`);
    if (!enabled) console.log('Envoi des mails désactivé');
  });
  server.on('error', () => {
    console.error('Impossible de démarrer les notifications : vérifier le port.');
    process.exitCode = 1;
  });
} catch {
  console.error('Impossible de démarrer les notifications : vérifier la configuration.');
  process.exitCode = 1;
}
