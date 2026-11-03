const nodemailer = require('nodemailer');

/**
 * Construit le transport SMTP local ou le transport HTTPS compatible Render gratuit.
 * Une réponse Brevo confirme l'acceptation du message, pas sa livraison finale.
 * @param {object} env Configuration fournie par les variables d'environnement.
 * @param {Function} fetchImpl Client HTTP injectable pour les tests.
 * @returns {{sendMail: Function}} Transport utilisable par le service de notifications.
 */
function createTransport(env, fetchImpl = fetch) {
  if ((env.EMAIL_PROVIDER || 'smtp') === 'brevo') {
    if (!env.BREVO_API_KEY || !env.EMAIL_FROM) throw new Error('Configuration Brevo incomplète.');
    return {
      async sendMail({ to, subject, text }) {
        const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { email: env.EMAIL_FROM },
            to: [{ email: to }],
            subject,
            textContent: text,
          }),
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        });
        if (response.status !== 201) throw new Error('Le fournisseur a refusé la notification.');
        const result = await response.json();
        if (!result.messageId) throw new Error('Accusé de réception du fournisseur absent.');
        return { accepted: [to] };
      },
    };
  }
  if (env.EMAIL_PROVIDER && env.EMAIL_PROVIDER !== 'smtp')
    throw new Error('Fournisseur de messagerie inconnu.');
  if (!env.EMAIL_USER || !env.EMAIL_APPLICATION_PASSWORD)
    throw new Error('Configuration SMTP incomplète.');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_APPLICATION_PASSWORD },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

module.exports = { createTransport };
