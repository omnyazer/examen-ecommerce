const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../models/User');
const { register } = require('../controllers/authController');
const { createApp } = require('../app');

test('inscription : validation et doublons', async (t) => {
  const find = t.mock.method(User, 'findOne', async () => null);
  const save = t.mock.method(User.prototype, 'save', async function () {
    return this;
  });
  const valid = {
    username: 'client-test',
    email: 'client@example.test',
    password: 'Exemple@Test2026',
  };
  async function submit(body) {
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await register({ body }, res);
    return res;
  }
  for (const body of [
    { ...valid, username: { $ne: null } },
    { ...valid, username: 'a' },
    { ...valid, email: 'invalide' },
    { ...valid, email: [] },
    { ...valid, role: 'admin' },
    { ...valid, password: 'É'.repeat(40) + '1!' },
  ]) {
    await t.test('les données non conformes sont refusées avant accès à la base', async () => {
      const response = await submit(body);
      assert.equal(response.code, 400);
      assert.equal(find.mock.callCount(), 0);
      assert.equal(save.mock.callCount(), 0);
    });
  }
  await t.test('email et nom sont nettoyés, le rôle reste user', async () => {
    assert.equal(
      (await submit({ ...valid, username: ' client-test ', email: ' CLIENT@EXAMPLE.TEST ' })).code,
      201
    );
    const user = save.mock.calls[0].this;
    assert.equal(user.email, 'client@example.test');
    assert.equal(user.username, 'client-test');
    assert.equal(user.role, 'user');
  });
  await t.test('une collision concurrente en base produit une erreur 409', async () => {
    save.mock.mockImplementation(async () => {
      throw { code: 11000 };
    });
    assert.equal((await submit(valid)).code, 409);
  });
});

test('les erreurs HTTP sont retournées en JSON sans détails internes', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const invalid = await fetch(`${root}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(invalid.status, 400);
  const error = await invalid.json();
  assert.equal(error.message, 'Le corps JSON est invalide.');
  assert.equal('stack' in error, false);
  const oversized = await fetch(`${root}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'a'.repeat(70000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(`${root}/route-inconnue`)).status, 404);
});
