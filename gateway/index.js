const express = require('express');
const { PORT, requireVars } = require('./src/config');
const expressApp = require('./src/express-app');
const { routes } = require('./src/routes');

requireVars('PORT', 'CUSTOMERS_URL', 'PRODUCTS_URL', 'SHOPPING_URL');

const StartServer = async () => {
    const app = express();
    await expressApp(app);

    app.listen(PORT, () => {
        console.log(`listenig to port ${PORT}`);
        routes.forEach((route) => console.log(`  ${route.prefix}  ->  ${route.target}`));
    }).on('error', (err) => {
        console.log(err);
        process.exit();
    });
};

StartServer();
