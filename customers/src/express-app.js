const express = require('express');
const cors = require('cors');
const customer = require('./api/customer');
const HandleErrors = require('./utils/error-handler');

module.exports = async (app) => {
    app.use(cors());
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    app.get('/health', (req, res) => res.json({ service: 'customers', status: 'up' }));

    app.use('/customer', customer);

    app.use(HandleErrors);
};
