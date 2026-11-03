const express = require('express');
const cors = require('cors');

function browserSecurity(origin) {
  const router = express.Router();
  router.use((req, res, next) => {
    const documentNavigation =
      req.method === 'GET' &&
      req.headers['sec-fetch-mode'] === 'navigate' &&
      req.headers['sec-fetch-dest'] === 'document' &&
      req.path !== '/api' &&
      !req.path.startsWith('/api/');
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      (req.headers['sec-fetch-site'] === 'cross-site' && !documentNavigation)
    ) {
      return res.status(403).json({ message: 'Origine de la requête non autorisée.' });
    }
    next();
  });
  router.use(cors({ origin, credentials: true }));
  return router;
}

module.exports = { browserSecurity };
