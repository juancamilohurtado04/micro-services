const mongoose = require('mongoose');
const { DB_URL } = require('../config');

module.exports = async () => {
    try {
        await mongoose.connect(DB_URL);
        console.log('Database connected');
    } catch (err) {
        console.error('Database connection error', err);
        throw err;
    }
};
