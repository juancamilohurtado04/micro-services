const express = require('express');
const { routes } = require('./index');

const router = express.Router();

router.get('/health', (req, res) => res.json({ service: 'gateway', status: 'up' }));

router.get('/health/services', async (req, res) => {
    const services = await Promise.all(
        routes.map(async (route) => {
            try {
                const response = await fetch(`${route.target}/health`, { signal: AbortSignal.timeout(5000) });
                return { name: route.name, target: route.target, status: response.ok ? 'up' : 'down' };
            } catch (err) {
                return { name: route.name, target: route.target, status: 'down', error: err.message };
            }
        }),
    );

    const allUp = services.every((service) => service.status === 'up');
    return res.status(allUp ? 200 : 503).json({ gateway: 'up', services });
});

module.exports = router;
