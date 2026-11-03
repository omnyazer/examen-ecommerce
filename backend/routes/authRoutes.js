// backend/routes/authRoutes.js
const express = require('express');
const { login, register, logout, me } = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);
router.get('/me', authenticateToken, me);

module.exports = router;
