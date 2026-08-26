require('dotenv').config({ quiet: true });

const config = {
    PORT: process.env.PORT || 8080,
    CUSTOMERS_URL: process.env.CUSTOMERS_URL,
    PRODUCTS_URL: process.env.PRODUCTS_URL,
    SHOPPING_URL: process.env.SHOPPING_URL,
};

config.requireVars = (...names) => {
    const missing = names.filter((name) => !config[name]);

    if (missing.length) {
        console.error(`Missing required config vars: ${missing.join(', ')}`);
        process.exit(1);
    }
};

module.exports = config;
