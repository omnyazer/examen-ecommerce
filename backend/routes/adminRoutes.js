// backend/routes/adminRoutes.js
const express = require('express');
const {
  getOrders,
  updateOrderStatus,
  validateOrder,
  getProducts,
  updateProductStock,
} = require('../controllers/adminController');
const { authenticateToken, isAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(authenticateToken, isAdmin);

// Récupérer la liste des commandes
router.get('/orders', getOrders);

// Changer l'état d'une commande
router.put('/orders/:orderId/status', updateOrderStatus);

// Valider une commande
router.put('/orders/:orderId/validate', validateOrder);

// Récupérer la liste des produits
router.get('/products', getProducts);

// Mettre à jour le stock d'un produit
router.put('/products/:productId/stock', updateProductStock);

module.exports = router;
