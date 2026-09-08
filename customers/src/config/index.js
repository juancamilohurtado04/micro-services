require('dotenv').config({ quiet: true });

const config = {
    PORT: process.env.PORT || 8001,
    DB_URL: process.env.DB_URL,
    APP_SECRET: process.env.APP_SECRET,
};

config.requireVars = (...names) => {
    const missing = names.filter((name) => !config[name]);

    if (missing.length) {
        console.error(`Missing required config vars: ${missing.join(', ')}`);
        process.exit(1);
    }
};

module.exports = config;
