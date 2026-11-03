const { logger } = require('../logger');
// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // modèle utilisateur
const { COOKIE_NAME, cookieOptions } = require('../utils/authCookie');
const schemas = require('../validation/schemas');
require('dotenv').config();

/** Authentifie les identifiants validés et pose un cookie HttpOnly valable une heure.
 * @function login
 * @param {object} req Requête Express contenant username et password.
 * @param {object} res Réponse Express sans JWT dans le JSON.
 */
exports.login = async (req, res) => {
  const validated = schemas.validate(schemas.login, req.body || {});
  if (validated.error) return res.status(400).json({ message: validated.error });
  const { username, password } = validated.value;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Identifiants incorrects.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Identifiants incorrects.' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
      algorithm: 'HS256',
    });

    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: 60 * 60 * 1000 });
    res.set('Cache-Control', 'no-store');
    res.json({ role: user.role, username: user.username });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/** Efface le cookie de session du navigateur.
 * @function logout
 * @param {object} req Requête Express.
 * @param {object} res Réponse Express.
 */
exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.set('Cache-Control', 'no-store');
  res.json({ message: 'Déconnexion effectuée.' });
};

/** Renvoie uniquement le nom et le rôle de la session authentifiée.
 * @function me
 * @param {object} req Requête enrichie par authenticateToken.
 * @param {object} res Réponse Express.
 */
exports.me = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ username: req.user.username, role: req.user.role });
};

/** Crée un compte client après validation des données et vérification des doublons.
 * @function register
 * @param {object} req Requête Express.
 * @param {object} res Réponse Express.
 */
exports.register = async (req, res) => {
  const validated = schemas.validate(schemas.register, req.body || {});
  if (validated.error) return res.status(400).json({ message: validated.error });
  const { username, email, password } = validated.value;

  try {
    // Vérifier si l'email ou le nom d'utilisateur existe déjà
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? 'Cet email est déjà utilisé.'
            : 'Ce nom d’utilisateur est déjà utilisé.',
      });
    }

    // Créer un nouvel utilisateur
    const user = new User({ username, email, password });
    await user.save();

    res.status(201).json({ message: 'Utilisateur créé avec succès.' });
  } catch (error) {
    if (error.code === 11000)
      return res
        .status(409)
        .json({ message: 'Ce nom d’utilisateur ou cet email est déjà utilisé.' });
    logger.error("Erreur lors de l'inscription");
    res.status(500).json({ message: 'Une erreur est survenue.' });
  }
};
