import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/admin';

export const getOrders = () => axios.get(`${API_BASE_URL}/orders`, { withCredentials: true });
export const getProducts = () => axios.get(`${API_BASE_URL}/products`, { withCredentials: true });

export const updateOrderStatus = (orderId, status) =>
  axios.put(`${API_BASE_URL}/orders/${orderId}/status`, { status }, { withCredentials: true });

export const validateOrder = (orderId) =>
  axios.put(`${API_BASE_URL}/orders/${orderId}/validate`, {}, { withCredentials: true });

export const updateProductStock = (productId, stock, expectedStock) =>
  axios.put(
    `${API_BASE_URL}/products/${productId}/stock`,
    { stock, expectedStock },
    { withCredentials: true }
  );
