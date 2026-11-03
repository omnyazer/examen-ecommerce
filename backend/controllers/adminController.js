const { getOrders, updateOrderStatus, validateOrder } = require('./orderController');
const { getProducts, updateProductStock } = require('./productController');

module.exports = { getOrders, updateOrderStatus, validateOrder, getProducts, updateProductStock };
