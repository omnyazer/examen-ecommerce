import axios from 'axios';

import { API_BASE_URL as apiUrl } from './config';
const API_BASE_URL = `${apiUrl}/admin`;

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
