const jwt = require('jsonwebtoken');
const { isObjectIdOrHexString } = require('mongoose');
const User = require('../models/User');
const { COOKIE_NAME, cookieOptions, readToken } = require('../utils/authCookie');

exports.authenticateToken = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Connexion requise.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!isObjectIdOrHexString(payload.userId)) throw new Error('Identifiant invalide');
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(401).json({ message: 'La session a expiré. Reconnectez-vous.' });
  }

  try {
    const user = await User.findById(payload.userId).select('_id username role');
    if (!user || !['user', 'admin'].includes(user.role)) {
      res.clearCookie(COOKIE_NAME, cookieOptions());
      return res.status(401).json({ message: 'Connexion requise.' });
    }
    req.user = { userId: String(user._id), username: user.username, role: user.role };
    next();
  } catch {
    res.status(503).json({ message: 'Impossible de vérifier la connexion. Réessayez plus tard.' });
  }
};

exports.isAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Accès interdit' });
  next();
};
