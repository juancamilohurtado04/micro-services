require('dotenv').config({ quiet: true });

const config = {
    PORT: process.env.PORT || 8003,
    DB_URL: process.env.DB_URL,
    APP_SECRET: process.env.APP_SECRET,
    // URL publica del catalogo: shopping lo consulta por HTTP, nunca por su base.
    PRODUCTS_URL: process.env.PRODUCTS_URL,
};

config.requireVars = (...names) => {
    const missing = names.filter((name) => !config[name]);

    if (missing.length) {
        console.error(`Missing required config vars: ${missing.join(', ')}`);
        process.exit(1);
    }
};

module.exports = config;
