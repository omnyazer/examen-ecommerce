const assert = require('node:assert/strict');
const { test } = require('node:test');
const axios = require('axios');
const { sendOrderNotification } = require('../services/notificationService');

test('notification de commande : configuration et résultat d’envoi', async (t) => {
  const keys = [
    'NOTIFICATIONS_ENABLED',
    'ORDER_NOTIFICATION_EMAIL',
    'INTERNAL_SERVICE_TOKEN',
    'GATEWAY_URL',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const post = t.mock.method(axios, 'post', async () => ({ status: 200 }));
  const order = {
    _id: '507f1f77bcf86cd799439011',
    total: 510,
    items: [{ productId: '507f1f77bcf86cd799439012', quantity: 3 }],
  };

  process.env.NOTIFICATIONS_ENABLED = 'false';
  assert.equal(await sendOrderNotification(order), 'disabled');
  assert.equal(post.mock.callCount(), 0);

  process.env.NOTIFICATIONS_ENABLED = 'true';
  process.env.ORDER_NOTIFICATION_EMAIL = 'recipient@example.test';
  process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
  process.env.GATEWAY_URL = 'http://gateway.example.test';
  assert.equal(await sendOrderNotification(order), 'sent');
  const [url, payload, options] = post.mock.calls[0].arguments;
  assert.equal(url, 'http://gateway.example.test/notify');
  assert.equal(payload.to, 'recipient@example.test');
  assert.match(payload.text, /510.00/);
  assert.equal(options.headers['X-Internal-Token'], 'test-token');

  post.mock.mockImplementation(async () => {
    throw new Error('SMTP_SECRET_TEST');
  });
  const errorLog = t.mock.method(console, 'error', () => {});
  assert.equal(await sendOrderNotification(order), 'failed');
  assert.equal(JSON.stringify(errorLog.mock.calls).includes('SMTP_SECRET_TEST'), false);

  delete process.env.ORDER_NOTIFICATION_EMAIL;
  const count = post.mock.callCount();
  assert.equal(await sendOrderNotification(order), 'failed');
  assert.equal(post.mock.callCount(), count);
});
