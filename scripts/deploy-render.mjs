import { setTimeout as delay } from 'node:timers/promises';

/** Déploie le commit testé et attend l'état live de chaque service, sans journaliser les secrets. */
export async function deployServices(env = process.env, fetchImpl = fetch, sleep = delay) {
  const names = ['STOCK', 'NOTIFICATIONS', 'GATEWAY', 'APP'];
  if (!env.RENDER_API_KEY || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ''))
    throw new Error('RENDER_API_KEY ou commit testé absent.');
  const services = names.map((name) => {
    const value = env[`RENDER_${name}_HOOK`];
    if (!value) throw new Error(`Secret RENDER_${name}_HOOK absent.`);
    const hook = new URL(value);
    if (
      hook.origin !== 'https://api.render.com' ||
      !/^\/deploy\/srv-[a-z0-9]+$/.test(hook.pathname)
    )
      throw new Error(`Hook ${name} invalide.`);
    hook.searchParams.set('ref', env.GITHUB_SHA);
    return { name, hook, serviceId: hook.pathname.split('/').pop() };
  });
  for (const { name, hook, serviceId } of services) {
    const started = await fetchImpl(hook, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (started.status !== 200)
      throw new Error(`Déploiement ${name} non démarré (HTTP ${started.status}).`);
    const result = await started.json();
    const deployId = result.deploy?.id || result.id;
    if (!/^dep-[a-z0-9]+$/.test(deployId || ''))
      throw new Error(`Identifiant de déploiement ${name} absent.`);
    let live = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      await sleep(10000);
      const response = await fetchImpl(
        `https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`,
        {
          headers: { Authorization: `Bearer ${env.RENDER_API_KEY}` },
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        }
      );
      if (response.status === 429 || response.status >= 500) continue;
      if (!response.ok) throw new Error(`Suivi ${name} refusé (HTTP ${response.status}).`);
      const deploy = await response.json();
      if (deploy.status === 'live') {
        if (deploy.commit?.id !== env.GITHUB_SHA)
          throw new Error(`Commit ${name} différent du commit testé.`);
        live = true;
        break;
      }
      if (
        ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(
          deploy.status
        )
      )
        throw new Error(`Déploiement ${name} terminé en échec.`);
    }
    if (!live) throw new Error(`Délai de déploiement ${name} dépassé.`);
    process.stdout.write(`${name} : commit testé en ligne.\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href
) {
  deployServices().catch(() => {
    process.stderr.write(
      'Déploiement Render incomplet. Vérifier les secrets et les événements Render.\n'
    );
    process.exitCode = 1;
  });
}
