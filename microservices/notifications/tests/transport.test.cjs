const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTransport } = require('../transport');

test('Brevo utilise HTTPS, un délai et un accusé de réception valide', async () => {
  let request;
  const transport = createTransport(
    { EMAIL_PROVIDER: 'brevo', EMAIL_FROM: 'sender@example.test', BREVO_API_KEY: 'private-key' },
    async (url, options) => {
      request = { url, options };
      return { status: 201, json: async () => ({ messageId: 'accepted-message' }) };
    }
  );
  const result = await transport.sendMail({
    to: 'recipient@example.test',
    subject: 'Test',
    text: 'Contenu',
  });
  assert.deepEqual(result.accepted, ['recipient@example.test']);
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.headers['api-key'], 'private-key');
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(request.options.body).sender, { email: 'sender@example.test' });
});

test('Brevo refuse les erreurs et les réponses sans accusé, sans exposer la réponse distante', async () => {
  for (const status of [401, 429, 500, 201]) {
    const transport = createTransport(
      { EMAIL_PROVIDER: 'brevo', EMAIL_FROM: 'sender@example.test', BREVO_API_KEY: 'private-key' },
      async () => ({ status, json: async () => ({ private: 'secret' }) })
    );
    await assert.rejects(
      transport.sendMail({ to: 'recipient@example.test', subject: 'Test', text: 'Contenu' }),
      (error) => !error.message.includes('secret') && !error.message.includes('private-key')
    );
  }
  assert.throws(() => createTransport({ EMAIL_PROVIDER: 'brevo' }));
  assert.throws(() => createTransport({ EMAIL_PROVIDER: 'unknown' }));
});
