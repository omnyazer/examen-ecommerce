require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Checkout = require('./models/Checkout');
const { createApp } = require('./app');
const { startRecovery } = require('./services/checkoutService');

async function start() {
  await connectDB();
  await Checkout.init();
  const stopRecovery = startRecovery();
  const port = process.env.PORT || 5000;
  const server = createApp().listen(port, () =>
    console.log(`Serveur en écoute sur le port ${port}`)
  );
  server.on('error', async () => {
    await stopRecovery();
    console.error('Impossible de démarrer le backend : vérifier le port.');
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

start().catch(async () => {
  console.error(
    'Impossible de démarrer le backend : vérifier la base de données et la configuration.'
  );
  await mongoose.disconnect();
  process.exitCode = 1;
});
