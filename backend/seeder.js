const mongoose = require('mongoose');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const Product = require('./models/Product');
const products = require('./data/products');
const { logger } = require('./logger');

/** Ajoute uniquement les produits absents ; conserve les prix et stocks déjà présents. */
async function seedProducts() {
  let inserted = 0;
  for (const product of products) {
    const result = await Product.updateOne(
      { name: product.name },
      { $setOnInsert: product },
      { upsert: true, runValidators: true }
    );
    inserted += result.upsertedCount;
  }
  return inserted;
}

if (require.main === module) {
  (async () => {
    if (!process.argv.includes('--seed-products'))
      throw new Error('Confirmation --seed-products requise.');
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI requis.');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    logger.info({ inserted: await seedProducts() }, 'catalogue_initialized');
  })()
    .catch((error) => {
      let message = 'Initialisation impossible : verifier MONGO_URI et --seed-products.';
      if (error.code === 18 || /bad auth|authentication failed/i.test(error.message || ''))
        message =
          'Atlas refuse les identifiants : verifier utilisateur et mot de passe de la base.';
      else if (['MongooseServerSelectionError', 'MongoServerSelectionError'].includes(error.name))
        message =
          'Atlas injoignable : ajouter votre IP personnelle dans IP Access List et verifier le reseau.';
      else if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ECONNREFUSED'].includes(error.code))
        message = 'Erreur DNS ou reseau : verifier le nom du cluster dans MONGO_URI.';
      else if (['MongoParseError', 'MongoInvalidArgumentError'].includes(error.name))
        message = 'Adresse MongoDB invalide : verifier sa syntaxe et encoder le mot de passe.';
      else if (error.code === 13 || /not authorized|unauthorized/i.test(error.message || ''))
        message =
          'Droits Atlas insuffisants : autoriser readWrite sur exam1Db pour cet utilisateur.';
      logger.error(message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { seedProducts };
