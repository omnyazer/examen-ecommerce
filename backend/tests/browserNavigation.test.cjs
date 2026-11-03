const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { browserSecurity } = require('../middlewares/browserSecurity');

test('navigation externe vers le site autorisée, API et mutations protégées', async (t) => {
  const app = express();
  app.use(browserSecurity('https://app.example'));
  app.use((req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  function request(path, method = 'GET', extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: {
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Dest': 'document',
            ...extraHeaders,
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        }
      );
      req.on('error', reject);
      req.end();
    });
  }
  assert.equal(await request('/'), 200);
  assert.equal(await request('/login'), 200);
  assert.equal(await request('/api/auth/me'), 403);
  assert.equal(await request('/api'), 403);
  assert.equal(await request('/login', 'POST'), 403);
  assert.equal(await request('/', 'GET', { 'Sec-Fetch-Mode': 'cors' }), 403);
  assert.equal(await request('/', 'GET', { Origin: 'https://foreign.example' }), 403);
});
