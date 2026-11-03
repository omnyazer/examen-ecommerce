const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('les journaux structurés masquent les secrets et identifient le service', () => {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `
    const { logger } = require('./logger');
    logger.info({password:'PRIVATE_PASSWORD',token:'PRIVATE_TOKEN',headers:{cookie:'PRIVATE_COOKIE'},body:{email:'PRIVATE_EMAIL'}},'safe_event');
  `,
    ],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' }
  );
  const log = JSON.parse(output.trim());
  assert.equal(log.service, 'backend');
  assert.equal(log.msg, 'safe_event');
  for (const secret of ['PRIVATE_PASSWORD', 'PRIVATE_TOKEN', 'PRIVATE_COOKIE', 'PRIVATE_EMAIL'])
    assert.equal(output.includes(secret), false);
});
