// Apaga la instancia en memoria al terminar la corrida: sin esto quedan
// procesos mongod huerfanos y Jest reporta "open handles".
module.exports = async () => {
    const mongod = globalThis.__MONGOD__;

    if (mongod) {
        await mongod.stop();
        globalThis.__MONGOD__ = undefined;
    }
};
