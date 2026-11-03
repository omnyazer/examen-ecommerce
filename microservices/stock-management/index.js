const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./models/Product');
const { createApp } = require('./app');
const { startupError } = require('./startupError');

async function start() {
  try {
    const app = createApp({ Product, serviceToken: process.env.INTERNAL_SERVICE_TOKEN });
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI est requis.');
    await mongoose.connect(process.env.MONGO_URI);
    const port = process.env.PORT || process.env.STOCK_PORT || 4003;
    const server = app.listen(port, () =>
      console.log(`Service de gestion des stocks sur le port ${port}`)
    );
    server.on('error', async () => {
      console.error('Impossible de démarrer le service de stock : vérifier le port.');
      await mongoose.disconnect();
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(startupError(error));
    await mongoose.disconnect();
    process.exitCode = 1;
  }
}

start();
