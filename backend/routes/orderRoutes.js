// backend/routes/orderRoutes.js
const express = require('express');
const {
  createOrder,
  getOrders,
  validateOrder,
  updateOrderStatus,
  getCheckout,
} = require('../controllers/orderController');
const { authenticateToken, isAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, isAdmin, getOrders); // Accès pour administrateurs
router.post('/', authenticateToken, createOrder); // Accès pour utilisateurs connectés
router.get('/requests/:requestKey', authenticateToken, getCheckout);
router.put('/:orderId/validate', authenticateToken, isAdmin, validateOrder); // Accès pour administrateurs
router.put('/:orderId/status', authenticateToken, isAdmin, updateOrderStatus); // Accès pour administrateurs

module.exports = router;
