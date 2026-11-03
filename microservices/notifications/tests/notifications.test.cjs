const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createApp } = require('../app');

test('notifications : contrôle des accès, validation et confidentialité', async (t) => {
  const sent = [];
  let fail = false;
  let accepted = true;
  const transporter = {
    async sendMail(mail) {
      sent.push(mail);
      if (fail)
        throw Object.assign(new Error('SMTP_SECRET_TEST'), { response: 'SMTP_SECRET_TEST' });
      return { accepted: accepted ? [mail.to] : [], rejected: accepted ? [] : [mail.to] };
    },
  };
  const serviceToken = 'internal-test-token';
  const server = createApp({
    transporter,
    sender: 'sender@example.test',
    serviceToken,
    enabled: true,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/notify`;
  const valid = {
    to: 'recipient@example.test',
    subject: 'PRIVATE_SUBJECT',
    text: 'PRIVATE_CONTENT',
  };
  const post = (body, token = serviceToken) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
      body: JSON.stringify(body),
    });

  await t.test('aucun mail sans autorisation', async () => {
    assert.equal((await post(valid, '')).status, 401);
    assert.equal(sent.length, 0);
  });

  await t.test('un JSON mal formé reçoit une erreur JSON sans envoi de mail', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': serviceToken },
      body: '{invalid',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, 'Le corps JSON est invalide.');
    assert.equal(sent.length, 0);
  });

  for (const body of [
    {},
    { ...valid, to: 'invalid' },
    { ...valid, to: 'one@example.test,two@example.test' },
    { ...valid, subject: 'Sujet\r\nBcc: other@example.test' },
    { ...valid, text: ' ' },
  ]) {
    await t.test('les données invalides sont refusées avant envoi', async () => {
      assert.equal((await post(body)).status, 400);
      assert.equal(sent.length, 0);
    });
  }

  await t.test(
    'un mail accepté utilise le destinataire prévu sans divulgation dans les logs',
    async () => {
      const log = t.mock.method(console, 'log', () => {});
      const response = await post(valid);
      assert.equal(response.status, 200);
      assert.deepEqual(sent[0], { from: 'sender@example.test', ...valid });
      const output = JSON.stringify({
        body: await response.json(),
        logs: log.mock.calls.map((call) => call.arguments),
      });
      for (const value of Object.values(valid)) assert.equal(output.includes(value), false);
      log.mock.restore();
    }
  );

  await t.test('une erreur SMTP ne révèle ni secret ni détails internes', async () => {
    fail = true;
    const errorLog = t.mock.method(console, 'error', () => {});
    const response = await post(valid);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal('error' in body, false);
    assert.equal(
      JSON.stringify({ body, logs: errorLog.mock.calls.map((call) => call.arguments) }).includes(
        'SMTP_SECRET_TEST'
      ),
      false
    );
    errorLog.mock.restore();
    fail = false;
  });

  await t.test('un destinataire refusé ne produit pas un faux succès', async () => {
    accepted = false;
    assert.equal((await post(valid)).status, 502);
  });

  await t.test('mode désactivé : aucun envoi possible', async () => {
    const disabled = createApp({ transporter, sender: '', serviceToken, enabled: false }).listen(
      0,
      '127.0.0.1'
    );
    await new Promise((resolve) => disabled.once('listening', resolve));
    try {
      const count = sent.length;
      const response = await fetch(`http://127.0.0.1:${disabled.address().port}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': serviceToken },
        body: JSON.stringify(valid),
      });
      assert.equal(response.status, 503);
      assert.equal(sent.length, count);
    } finally {
      await new Promise((resolve) => disabled.close(resolve));
    }
  });
});
