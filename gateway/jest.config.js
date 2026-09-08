module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],

    // El gateway no tiene base de datos: solo hace falta fijar las variables
    // de entorno antes de importar src/config.
    setupFiles: ['<rootDir>/__tests__/helpers/setup-env.js'],

    detectOpenHandles: true,
    forceExit: true,

    clearMocks: true,
    restoreMocks: true,

    testTimeout: 30000,

    collectCoverageFrom: ['src/**/*.js'],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/src/config/index.js',
        '<rootDir>/src/express-app.js',
    ],
    coverageDirectory: 'coverage',
};
