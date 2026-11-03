const mongoose = require('mongoose');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const User = require('./models/User');
const { logger } = require('./logger');

/** Promeut uniquement un compte existant explicitement identifié par son email. */
async function promoteAdmin() {
  if (
    !process.argv.includes('--promote-admin') ||
    !process.env.ADMIN_EMAIL ||
    !process.env.MONGO_URI
  )
    throw new Error('Configuration ou confirmation absente.');
  await mongoose.connect(process.env.MONGO_URI);
  const result = await User.updateOne(
    { email: process.env.ADMIN_EMAIL.trim().toLowerCase() },
    { $set: { role: 'admin' } },
    { runValidators: true }
  );
  if (result.matchedCount !== 1) throw new Error('Compte introuvable.');
  logger.info('Droits administrateur appliqués au compte existant sélectionné.');
}

promoteAdmin()
  .catch(() => {
    logger.error(
      'Promotion impossible : vérifier le compte existant, ADMIN_EMAIL, MONGO_URI et --promote-admin.'
    );
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
