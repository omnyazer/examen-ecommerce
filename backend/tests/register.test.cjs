const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../models/User');
const { register } = require('../controllers/authController');

const invalidPasswords = [
  ['mot de passe absent', undefined],
  ['valeur non textuelle', 123456789012],
  ['mot de passe vide', ''],
  ['seulement 11 caractères', 'Abcdefgh1!x'],
  ['majuscule absente', 'abcdefghij1!'],
  ['chiffre absent', 'Abcdefghijk!'],
  ['caractère spécial absent', 'Abcdefghijk1'],
  ['espace utilisé comme caractère spécial', 'Abcdefghij1 '],
  ['lettre accentuée utilisée comme caractère spécial', 'Abcdefghij1é'],
  ['moins de 12 caractères avec un emoji', 'Abcdefgh1!😀'],
];

test('inscription : validation du mot de passe avant accès à la base', async (t) => {
  const findUser = t.mock.method(User, 'findOne', async () => null);
  const saveUser = t.mock.method(User.prototype, 'save', async function () {
    return this;
  });

  async function submit(password) {
    const response = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await register(
      { body: { username: 'client-test', email: 'client@example.test', password } },
      response
    );
    return response;
  }

  for (const [label, password] of invalidPasswords) {
    await t.test(label, async () => {
      const response = await submit(password);
      assert.equal(response.statusCode, 400);
      assert.match(response.body.message, /12 caractères/);
      assert.equal(findUser.mock.callCount(), 0);
      assert.equal(saveUser.mock.callCount(), 0);
    });
  }

  await t.test('12 caractères avec tous les critères : inscription acceptée', async () => {
    const response = await submit('Abcdefghij1!');
    assert.equal(response.statusCode, 201);
    assert.equal(saveUser.mock.callCount(), 1);
  });

  await t.test('une majuscule accentuée est acceptée', async () => {
    const response = await submit('Ébcdefghij1!');
    assert.equal(response.statusCode, 201);
  });

  await t.test('un email existant reste refusé', async () => {
    findUser.mock.mockImplementation(async () => ({ email: 'client@example.test' }));
    const previousSaves = saveUser.mock.callCount();
    const response = await submit('Abcdefghij1!');
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, 'Cet email est déjà utilisé.');
    assert.equal(saveUser.mock.callCount(), previousSaves);
  });
});
