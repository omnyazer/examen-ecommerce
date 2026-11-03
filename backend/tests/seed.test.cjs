const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { seedProducts } = require('../seeder');

test(
  'initialiser le catalogue conserve les produits et les stocks existants',
  { skip: !process.env.STOCK_TEST_MONGO_URI },
  async () => {
    const database = `seed_test_${randomUUID().replaceAll('-', '')}`;
    try {
      await mongoose.connect(process.env.STOCK_TEST_MONGO_URI, { dbName: database });
      assert.equal(await seedProducts(), 5);
      const existing = await Product.findOne({ name: 'Smartphone' });
      await Product.updateOne({ _id: existing._id }, { $set: { stock: 3, price: 625 } });
      await Product.create({
        name: 'Produit existant',
        description: 'Conserver',
        price: 12,
        stock: 4,
      });
      assert.equal(await seedProducts(), 0);
      assert.equal(await Product.countDocuments(), 6);
      const preserved = await Product.findById(existing._id);
      assert.equal(preserved.stock, 3);
      assert.equal(preserved.price, 625);
    } finally {
      if (mongoose.connection.name === database && /^seed_test_[a-f0-9]{32}$/.test(database))
        await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
);
