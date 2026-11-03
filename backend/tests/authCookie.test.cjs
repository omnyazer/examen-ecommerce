const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { browserSecurity } = require('../middlewares/browserSecurity');
const { authenticateToken, isAdmin } = require('../middlewares/authMiddleware');

test('authentification par cookie HttpOnly', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.JWT_SECRET = 'cookie-test-secret';
  process.env.NODE_ENV = 'test';
  const password = 'Exemple@Test2026';
  const id = '507f1f77bcf86cd799439011';
  let currentUser = {
    _id: id,
    username: 'admin-test',
    role: 'admin',
    password: await bcrypt.hash(password, 4),
  };
  t.mock.method(User, 'findOne', async ({ username }) =>
    username === 'admin-test' ? currentUser : null
  );
  t.mock.method(User, 'findById', () => ({ select: async () => currentUser }));
  const app = express();
  app.use(browserSecurity('http://localhost:3002'));
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.get('/admin-check', authenticateToken, isAdmin, (req, res) => res.json({ allowed: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  });
  async function request(
    path,
    { method = 'GET', body, cookie, origin = 'http://localhost:3002', extraHeaders = {} } = {}
  ) {
    return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  let cookie;

  await t.test('connexion : cookie HttpOnly, aucun token dans le JSON', async () => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin-test', password },
    });
    assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie');
    assert.match(header, /^session=/);
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=Lax/i);
    assert.match(header, /Max-Age=3600/i);
    assert.doesNotMatch(header, /; Secure/i);
    assert.deepEqual(await response.json(), { username: 'admin-test', role: 'admin' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3002');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    cookie = header.split(';')[0];
  });

  await t.test('le cookie permet de restaurer la connexion et les droits admin', async () => {
    const response = await request('/api/auth/me', { cookie });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { username: 'admin-test', role: 'admin' });
    assert.equal((await request('/admin-check', { cookie })).status, 200);
  });

  await t.test(
    'les droits sont relus en base et ne dépendent pas du rôle contenu dans un ancien token',
    async () => {
      currentUser = { ...currentUser, role: 'user' };
      assert.equal((await request('/admin-check', { cookie })).status, 403);
      currentUser = { ...currentUser, role: 'admin' };
    }
  );

  await t.test('sans cookie, un token Bearer seul ne donne aucun accès', async () => {
    assert.equal((await request('/api/auth/me')).status, 401);
    assert.equal(
      (
        await request('/api/auth/me', {
          extraHeaders: { Authorization: `Bearer ${cookie.slice('session='.length)}` },
        })
      ).status,
      401
    );
  });

  await t.test('les sessions invalides et expirées sont refusées et effacées', async () => {
    const expired = jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: -1 });
    for (const value of ['invalid', expired, '%invalid']) {
      const response = await request('/api/auth/me', { cookie: `session=${value}` });
      assert.equal(response.status, 401);
      if (value !== '%invalid') assert.match(response.headers.get('set-cookie'), /^session=;/);
    }
  });

  await t.test('les identifiants incorrects ne créent pas de cookie', async () => {
    for (const body of [
      { username: 'admin-test', password: 'incorrect' },
      { username: 'absent', password },
    ]) {
      const response = await request('/api/auth/login', { method: 'POST', body });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal((await response.json()).message, 'Identifiants incorrects.');
    }
  });

  await t.test('un type incorrect est refusé avant la recherche utilisateur', async () => {
    assert.equal(
      (
        await request('/api/auth/login', {
          method: 'POST',
          body: { username: { $ne: null }, password },
        })
      ).status,
      400
    );
  });

  await t.test('une origine étrangère ou une requête cross-site est refusée', async () => {
    assert.equal(
      (
        await request('/api/auth/logout', {
          method: 'POST',
          cookie,
          origin: 'https://foreign.example',
          body: {},
        })
      ).status,
      403
    );
    assert.equal(
      (
        await request('/api/auth/logout', {
          method: 'POST',
          cookie,
          extraHeaders: { 'Sec-Fetch-Site': 'cross-site' },
          body: {},
        })
      ).status,
      403
    );
  });

  await t.test('la déconnexion efface le cookie avec les mêmes attributs', async () => {
    const response = await request('/api/auth/logout', { method: 'POST', cookie, body: {} });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /^session=;/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  });

  await t.test('en production, le cookie exige HTTPS', async () => {
    process.env.NODE_ENV = 'production';
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin-test', password },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure/i);
  });
});
