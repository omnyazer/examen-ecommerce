const pino = require('pino');
const { randomUUID } = require('node:crypto');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'gateway',
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  },
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'authorization',
      'cookie',
      'email',
      'body',
      'headers',
      'req',
      'res',
      'err',
    ],
    remove: true,
  },
});

/** Journalise uniquement les métadonnées techniques, jamais les en-têtes ni les données du client. */
function requestLog(req, res, next) {
  const requestId = randomUUID();
  const started = process.hrtime.bigint();
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](
      { requestId, method: req.method, statusCode: res.statusCode, durationMs },
      'http_request'
    );
  });
  next();
}

module.exports = { logger, requestLog };
