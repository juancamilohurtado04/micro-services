// src/config y src/routes leen process.env en tiempo de require.
// Estos valores son solo placeholders: las pruebas de integracion levantan
// servidores stub reales y sobreescriben las URLs con jest.resetModules().
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.CUSTOMERS_URL = 'http://127.0.0.1:59001';
process.env.PRODUCTS_URL = 'http://127.0.0.1:59002';
process.env.SHOPPING_URL = 'http://127.0.0.1:59003';
