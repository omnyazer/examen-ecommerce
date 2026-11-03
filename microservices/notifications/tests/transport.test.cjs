const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTransport } = require('../transport');

test('Resend transmet le mail en HTTPS avec sa clé privée et vérifie son acceptation', async () => {
  let request;
  const transport = createTransport(
    {
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM: 'onboarding@resend.dev',
      RESEND_API_KEY: 'private-key',
    },
    async (url, options) => {
      request = { url, options };
      return { status: 200, json: async () => ({ id: 'accepted-id' }) };
    }
  );
  const mail = { to: 'recipient@example.test', subject: 'Test', text: 'Contenu' };
  assert.deepEqual(await transport.sendMail(mail), { accepted: [mail.to] });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.Authorization, 'Bearer private-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    from: 'onboarding@resend.dev',
    to: [mail.to],
    subject: mail.subject,
    text: mail.text,
  });
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('Resend refuse les erreurs et réponses incomplètes sans divulguer les détails distants', async () => {
  for (const status of [401, 403, 429, 500, 200]) {
    const transport = createTransport(
      {
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM: 'onboarding@resend.dev',
        RESEND_API_KEY: 'private-key',
      },
      async () => ({ status, json: async () => ({ message: 'PRIVATE_REMOTE_CONTENT' }) })
    );
    await assert.rejects(
      transport.sendMail({ to: 'recipient@example.test', subject: 'Test', text: 'Contenu' }),
      (error) =>
        !error.message.includes('PRIVATE_REMOTE_CONTENT') && !error.message.includes('private-key')
    );
  }
  assert.throws(() =>
    createTransport({ EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'onboarding@resend.dev' })
  );
});

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
