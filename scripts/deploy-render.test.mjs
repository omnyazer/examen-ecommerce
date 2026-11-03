import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployServices } from './deploy-render.mjs';

const env = { RENDER_API_KEY: 'secret', GITHUB_SHA: 'a'.repeat(40) };
for (const name of ['STOCK', 'NOTIFICATIONS', 'GATEWAY', 'APP'])
  env[`RENDER_${name}_HOOK`] = `https://api.render.com/deploy/srv-${name.toLowerCase()}?key=secret`;

test('déploie uniquement le commit testé et attend les quatre services', async () => {
  let hooks = 0;
  await deployServices(
    env,
    async (url, options) => {
      if (options.method === 'POST') {
        assert.equal(new URL(url).searchParams.get('ref'), env.GITHUB_SHA);
        hooks++;
        return { status: 200, json: async () => ({ deploy: { id: 'dep-test' } }) };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ status: 'live', commit: { id: env.GITHUB_SHA } }),
      };
    },
    async () => {}
  );
  assert.equal(hooks, 4);
});

test('refuse les secrets manquants avant tout déploiement et arrête la chaîne en cas d’échec', async () => {
  await assert.rejects(deployServices({ ...env, RENDER_APP_HOOK: '' }), /absent/);
  let count = 0;
  await assert.rejects(
    deployServices(
      env,
      async () => {
        count++;
        return {
          status: 200,
          ok: true,
          json: async () =>
            count === 1 ? { deploy: { id: 'dep-test' } } : { status: 'build_failed' },
        };
      },
      async () => {}
    ),
    /échec/
  );
  assert.equal(count, 2);
});
