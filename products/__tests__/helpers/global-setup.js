// Levanta UNA sola instancia de MongoDB en memoria para toda la corrida de Jest.
// La URI se publica en process.env para que cada archivo de test se conecte a ella.
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
    const mongod = await MongoMemoryServer.create();

    process.env.MONGO_URI = mongod.getUri();
    // Se guarda en globalThis porque globalTeardown corre en el mismo proceso.
    globalThis.__MONGOD__ = mongod;
};
