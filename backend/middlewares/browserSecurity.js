const express = require('express');
const cors = require('cors');

function browserSecurity(origin) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      return res.status(403).json({ message: 'Origine de la requête non autorisée.' });
    }
    next();
  });
  router.use(cors({ origin, credentials: true }));
  return router;
}

module.exports = { browserSecurity };
