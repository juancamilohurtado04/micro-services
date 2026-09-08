// Corre antes de cargar cada archivo de test (setupFiles).
// src/config lee process.env en tiempo de require, asi que las variables deben
// existir ANTES de que cualquier modulo del servicio sea importado.
// dotenv no sobreescribe variables ya definidas, por lo que un .env local
// nunca contamina la corrida de pruebas.
process.env.NODE_ENV = 'test';
process.env.MONGOMS_SKIP_MD5_CHECK = 'true';
process.env.APP_SECRET = 'test-app-secret';
process.env.PORT = '0';
process.env.DB_URL = process.env.MONGO_URI;
