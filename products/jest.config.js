// mongodb-memory-server verifica el md5 del binario descargado; saltarlo evita
// fallos en redes/proxies que alteran la descarga y acelera el arranque.
process.env.MONGOMS_SKIP_MD5_CHECK = 'true';

module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],

    // Instancia unica de Mongo en memoria para toda la corrida.
    globalSetup: '<rootDir>/__tests__/helpers/global-setup.js',
    globalTeardown: '<rootDir>/__tests__/helpers/global-teardown.js',

    // Variables de entorno antes de importar src/config.
    setupFiles: ['<rootDir>/__tests__/helpers/setup-env.js'],

    // Diagnostico y cierre de procesos colgados.
    detectOpenHandles: true,
    forceExit: true,

    clearMocks: true,
    restoreMocks: true,

    // El arranque del mongod en memoria puede tardar en la primera corrida.
    testTimeout: 30000,

    collectCoverageFrom: ['src/**/*.js'],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/src/config/index.js',
        '<rootDir>/src/express-app.js',
        '<rootDir>/src/database/connection.js',
        // Script de un solo uso ejecutado con `npm run seed`, no forma parte
        // del runtime del microservicio.
        '<rootDir>/src/database/seed/',
    ],
    coverageDirectory: 'coverage',
};
