const express = require('express');
const { PORT, requireVars } = require('./src/config');
const { databaseConnection } = require('./src/database');
const expressApp = require('./src/express-app');

requireVars('PORT', 'DB_URL', 'APP_SECRET');

const StartServer = async () => {
    const app = express();
    await databaseConnection();
    await expressApp(app);

    app.listen(PORT, () => {
        console.log(`listenig to port ${PORT}`);
    }).on('error', (err) => {
        console.log(err);
        process.exit();
    });
};

StartServer();
