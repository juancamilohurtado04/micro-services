const mongoose = require('mongoose');
const { DB_URL } = require('../../config');
const { ProductModel } = require('../models');
const products = require('./products');

(async () => {
    try {
        await mongoose.connect(DB_URL);

        for (const product of products) {
            await ProductModel.updateOne({ name: product.name }, { $setOnInsert: product }, { upsert: true });
        }

        console.log(`Seeded ${products.length} products`);
    } catch (err) {
        console.error('Seeding failed', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();
