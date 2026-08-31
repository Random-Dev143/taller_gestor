'use strict';
module.exports = {
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    globalSetup: '<rootDir>/tests/setup/globalSetup.js',
    globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
    // Todos los archivos de test comparten UN mismo server + UNA misma DB
    // (igual que las pruebas manuales que veníamos haciendo por curl), así
    // que tienen que correr en serie, nunca en paralelo entre sí.
    maxWorkers: 1,
    testTimeout: 20000,
    verbose: true
};
