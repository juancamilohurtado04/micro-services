const express = require('express');
const proxy = require('express-http-proxy');
const { CUSTOMERS_URL, PRODUCTS_URL, SHOPPING_URL } = require('../config');
const { BadGatewayError } = require('../utils/app-errors');

const router = express.Router();

const routes = [
    { name: 'customers', prefix: '/customer', target: CUSTOMERS_URL },
    { name: 'products', prefix: '/products', target: PRODUCTS_URL },
    { name: 'shopping', prefix: '/shopping', target: SHOPPING_URL },
];

routes.forEach((route) => {
    router.use(
        route.prefix,
        proxy(route.target, {
            proxyReqPathResolver: (req) => `${route.prefix}${req.url}`,

            proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
                if (srcReq.headers.authorization) {
                    proxyReqOpts.headers.authorization = srcReq.headers.authorization;
                }
                return proxyReqOpts;
            },

            proxyErrorHandler: (err, res, next) => {
                console.error(`[gateway] fallo el proxy hacia ${route.name} (${route.target}):`, err.message);
                return next(new BadGatewayError(`El microservicio "${route.name}" no esta disponible`));
            },
        }),
    );
});

module.exports = router;
module.exports.routes = routes;
