// src/services/api.js
import axios from 'axios';

import { API_BASE_URL } from './config';
const pendingKey = 'pendingOrderRequest';

export const hasPendingOrder = () => Boolean(sessionStorage.getItem(pendingKey));

export const fetchProducts = () => axios.get(`${API_BASE_URL}/products`, { withCredentials: true });

export const createOrder = async (orderData) => {
  let key = sessionStorage.getItem(pendingKey);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(pendingKey, key);
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/orders`, orderData, {
      withCredentials: true,
      headers: { 'Idempotency-Key': key },
    });
    if (response.status === 201) sessionStorage.removeItem(pendingKey);
    return response;
  } catch (error) {
    if (
      [400, 404, 409].includes(error.response?.status) &&
      error.response?.data?.code !== 'CHECKOUT_KEY_REUSED'
    ) {
      sessionStorage.removeItem(pendingKey);
    }
    throw error;
  }
};

export const getPendingOrder = async () => {
  const key = sessionStorage.getItem(pendingKey);
  if (!key) return null;
  try {
    const response = await axios.get(`${API_BASE_URL}/orders/requests/${key}`, {
      withCredentials: true,
    });
    if (response.status === 200) sessionStorage.removeItem(pendingKey);
    return response;
  } catch (error) {
    if ([400, 404, 409].includes(error.response?.status)) sessionStorage.removeItem(pendingKey);
    throw error;
  }
};
