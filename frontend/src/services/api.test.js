import axios from 'axios';
import { createOrder, getPendingOrder, hasPendingOrder } from './api';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});

test('une réponse perdue conserve la même clé lors de la nouvelle tentative', async () => {
  axios.post.mockRejectedValueOnce(new Error('Response lost'));
  await expect(createOrder({ items: [] })).rejects.toThrow('Response lost');
  const key = axios.post.mock.calls[0][2].headers['Idempotency-Key'];
  expect(hasPendingOrder()).toBe(true);
  axios.post.mockResolvedValueOnce({ status: 201, data: { order: {} } });
  await createOrder({ items: [] });
  expect(axios.post.mock.calls[1][2].headers['Idempotency-Key']).toBe(key);
  expect(hasPendingOrder()).toBe(false);
});

test('une confirmation en attente est vérifiée sans nouvelle soumission', async () => {
  axios.post.mockResolvedValueOnce({ status: 202, data: { pending: true } });
  await createOrder({ items: [] });
  expect(hasPendingOrder()).toBe(true);
  axios.get.mockResolvedValueOnce({ status: 202, data: { pending: true } });
  await getPendingOrder();
  expect(hasPendingOrder()).toBe(true);
  axios.get.mockResolvedValueOnce({ status: 200, data: { order: {} } });
  await getPendingOrder();
  expect(hasPendingOrder()).toBe(false);
  expect(axios.post).toHaveBeenCalledTimes(1);
});

test('un refus définitif permet une nouvelle demande, un conflit de clé conserve la demande existante', async () => {
  axios.post.mockRejectedValueOnce({ response: { status: 409, data: {} } });
  await expect(createOrder({})).rejects.toBeDefined();
  expect(hasPendingOrder()).toBe(false);
  axios.post.mockRejectedValueOnce({
    response: { status: 409, data: { code: 'CHECKOUT_KEY_REUSED' } },
  });
  await expect(createOrder({})).rejects.toBeDefined();
  expect(hasPendingOrder()).toBe(true);
});
