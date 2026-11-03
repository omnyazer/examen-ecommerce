const { logger, requestLog } = require('./logger');
// gateway/server.js
const express = require('express');
const dotenv = require('dotenv');
//const authProxy = require('./routes/auth');
const notifiProxy = require('./routes/notifi');
const stockProxy = require('./routes/stock');

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(requestLog);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Middleware pour analyser les requêtes JSON
app.use(express.json());

// Routes principales pour chaque microservice
//app.use('/auth', authProxy);
app.use('/notify', notifiProxy);
app.use('/update-stock', stockProxy);
app.use('/release-stock', stockProxy);
app.use((req, res) => res.status(404).json({ message: 'Ressource introuvable.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status =
    error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 503;
  res.status(status).json({
    message:
      status === 400 ? 'Le corps JSON est invalide.' : 'La requête ne peut pas être traitée.',
  });
});

// Lancer le Gateway
const PORT = process.env.PORT || process.env.GATEWAY_PORT || 8000;
app.listen(PORT, () => {
  logger.info(`Gateway opérationnel sur le port ${PORT}`);
});
