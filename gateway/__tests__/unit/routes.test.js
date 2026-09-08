// Pruebas unitarias de la tabla de enrutamiento del gateway.
const proxyRouter = require('../../src/routes');
const { routes } = require('../../src/routes');
const { CUSTOMERS_URL, PRODUCTS_URL, SHOPPING_URL } = require('../../src/config');

describe('tabla de rutas del gateway', () => {
    it('expone un prefijo por microservicio apuntando a su URL configurada', () => {
        expect(routes).toEqual([
            { name: 'customers', prefix: '/customer', target: CUSTOMERS_URL },
            { name: 'products', prefix: '/products', target: PRODUCTS_URL },
            { name: 'shopping', prefix: '/shopping', target: SHOPPING_URL },
        ]);
    });

    it('adjunta la tabla al router para que el manejador de 404 pueda listarla', () => {
        expect(proxyRouter.routes).toBe(routes);
        expect(proxyRouter.routes.map((route) => route.prefix)).toEqual(['/customer', '/products', '/shopping']);
    });

    it('no repite prefijos entre microservicios', () => {
        const prefijos = routes.map((route) => route.prefix);

        expect(new Set(prefijos).size).toBe(prefijos.length);
    });

    it('no deja ningun target sin configurar', () => {
        routes.forEach((route) => {
            expect(route.target).toEqual(expect.stringMatching(/^https?:\/\//));
        });
    });
});
