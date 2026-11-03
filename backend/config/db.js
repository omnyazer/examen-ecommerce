const { logger } = require('../logger');
// config/db.js
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('MongoDB connecté');
  } catch (err) {
    logger.error('Erreur de connexion à MongoDB');
    process.exit(1);
  }
};

module.exports = connectDB;
