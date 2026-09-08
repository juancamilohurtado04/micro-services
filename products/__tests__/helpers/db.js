const mongoose = require('mongoose');

const DB_NAME = 'products-test';

// Cada archivo de test corre con su propio registro de modulos, por lo que
// recibe su propia instancia de mongoose y su propia conexion.
const connect = async () => {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGO_URI, { dbName: DB_NAME });
    }

    return mongoose.connection;
};

// Reconstruye los indices declarados en los schemas (unique, etc.).
// Necesario cuando una prueba depende de una restriccion de indice.
const syncIndexes = async () => {
    const models = mongoose.modelNames().map((name) => mongoose.model(name));

    await Promise.all(models.map((model) => model.syncIndexes()));
};

// Deja la BD vacia entre pruebas conservando los indices.
const clear = async () => {
    const collections = Object.values(mongoose.connection.collections);

    await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

// Cierre limpio: sin dropDatabase + disconnect quedan handles abiertos.
const close = async () => {
    if (mongoose.connection.readyState === 0) return;

    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};

module.exports = { connect, syncIndexes, clear, close, DB_NAME };
