const { logger, requestLog } = require('./logger');
const express = require('express');
const { timingSafeEqual } = require('node:crypto');

function createApp({ transporter, sender, serviceToken, enabled }) {
  if (!serviceToken) throw new Error('INTERNAL_SERVICE_TOKEN est requis.');
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLog);
  app.get('/health', (req, res) => {
    const ready = true;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    const received = Buffer.from(req.get('X-Internal-Token') || '');
    const expected = Buffer.from(serviceToken);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return res.status(401).json({ message: 'Accès au service de notifications refusé.' });
    }
    next();
  });

  app.post('/notify', async (req, res) => {
    if (!enabled) {
      return res.status(503).json({ message: 'L’envoi des notifications est désactivé.' });
    }
    const { to, subject, text } = req.body || {};
    if (
      typeof to !== 'string' ||
      !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to) ||
      typeof subject !== 'string' ||
      !subject.trim() ||
      subject.length > 200 ||
      /[\r\n]/.test(subject) ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 20000
    ) {
      return res
        .status(400)
        .json({ message: 'Le destinataire, le sujet et le contenu du mail doivent être valides.' });
    }
    try {
      const result = await transporter.sendMail({ from: sender, to, subject, text });
      if (!result.accepted?.some((address) => address.toLowerCase() === to.toLowerCase())) {
        throw new Error('Destinataire refusé');
      }
      logger.info('Notification acceptée par le fournisseur de messagerie');
      return res
        .status(200)
        .json({ message: 'Notification acceptée par le fournisseur de messagerie.' });
    } catch {
      logger.error('Échec de l’envoi de la notification');
      return res.status(502).json({ message: 'Le mail de notification n’a pas pu être envoyé.' });
    }
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    res.status(status).json({
      message:
        status === 400 ? 'Le corps JSON est invalide.' : 'La requête ne peut pas être traitée.',
    });
  });
  return app;
}

module.exports = { createApp };
