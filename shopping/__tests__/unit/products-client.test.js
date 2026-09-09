// El cliente HTTP del catalogo es la unica puerta por la que shopping toca
// otro dominio. Se prueba con fetch mockeado: aqui no hay red ni Mongo.
const { ServiceUnavailableError } = require('../../src/utils/app-errors');
const { PRODUCTS_URL } = require('../../src/config');

const respuesta = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

// El modulo resuelve `fetch` en cada llamada, asi que basta con sustituir el
// global: no hace falta resetear el registro de modulos (y hacerlo romperia
// el `instanceof`, porque cargaria una copia distinta de app-errors).
const client = require('../../src/clients/products-client');

describe('products-client', () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterEach(() => {
        delete global.fetch;
    });

    describe('GetProduct', () => {
        it('pide el producto a la API publica de products, no a su base', async () => {
            global.fetch.mockResolvedValue(respuesta(200, { _id: 'p1', name: 'Sedan' }));

            const producto = await client.GetProduct('p1');

            expect(producto).toEqual({ _id: 'p1', name: 'Sedan' });
            expect(global.fetch).toHaveBeenCalledWith(
                `${PRODUCTS_URL}/products/p1`,
                expect.objectContaining({ signal: expect.anything() }),
            );
        });

        it('escapa el id en la URL', async () => {
            global.fetch.mockResolvedValue(respuesta(404, null));

            await client.GetProduct('p 1/../secreto');

            expect(global.fetch.mock.calls[0][0]).toBe(
                `${PRODUCTS_URL}/products/p%201%2F..%2Fsecreto`,
            );
        });

        // Un 404 es una respuesta valida del catalogo, no una caida: significa
        // "ese producto no existe". Confundirlos haria que un id mal escrito
        // se reportara como servicio no disponible.
        it('devuelve null en 404 sin tratarlo como caida', async () => {
            global.fetch.mockResolvedValue(respuesta(404, { message: 'Product not found' }));

            await expect(client.GetProduct('p9')).resolves.toBeNull();
        });

        it('lanza 503 cuando el catalogo responde con un error', async () => {
            global.fetch.mockResolvedValue(respuesta(500, null));

            const promise = client.GetProduct('p1');

            await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableError);
            await expect(promise).rejects.toMatchObject({ statusCode: 503 });
        });

        it('lanza 503 cuando la conexion falla o expira', async () => {
            global.fetch.mockRejectedValue(new Error('The operation was aborted due to timeout'));

            const promise = client.GetProduct('p1');

            await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableError);
            await expect(promise).rejects.toMatchObject({
                message: expect.stringContaining('no esta disponible'),
            });
        });

        it('acota la peticion con un AbortSignal para no quedarse colgado', async () => {
            global.fetch.mockResolvedValue(respuesta(200, {}));

            await client.GetProduct('p1');

            expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        });
    });

    describe('GetProductsByIds', () => {
        it('devuelve un mapa id -> producto', async () => {
            global.fetch
                .mockResolvedValueOnce(respuesta(200, { _id: 'p1', name: 'Sedan' }))
                .mockResolvedValueOnce(respuesta(200, { _id: 'p2', name: 'SUV' }));

            const mapa = await client.GetProductsByIds(['p1', 'p2']);

            expect(mapa.get('p1')).toMatchObject({ name: 'Sedan' });
            expect(mapa.get('p2')).toMatchObject({ name: 'SUV' });
        });

        it('pide cada id una sola vez aunque se repita', async () => {
            global.fetch.mockResolvedValue(respuesta(200, { _id: 'p1' }));

            await client.GetProductsByIds(['p1', 'p1', 'p1']);

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('omite del mapa los ids que el catalogo no conoce', async () => {
            global.fetch
                .mockResolvedValueOnce(respuesta(200, { _id: 'p1' }))
                .mockResolvedValueOnce(respuesta(404, null));

            const mapa = await client.GetProductsByIds(['p1', 'p9']);

            expect([...mapa.keys()]).toEqual(['p1']);
        });

        it('propaga el 503 si alguna consulta falla', async () => {
            global.fetch
                .mockResolvedValueOnce(respuesta(200, { _id: 'p1' }))
                .mockRejectedValueOnce(new Error('ECONNREFUSED'));

            await expect(client.GetProductsByIds(['p1', 'p2'])).rejects.toBeInstanceOf(
                ServiceUnavailableError,
            );
        });
    });

    describe('TryGetProductsByIds', () => {
        it('se comporta igual que GetProductsByIds cuando el catalogo responde', async () => {
            global.fetch.mockResolvedValue(respuesta(200, { _id: 'p1', name: 'Sedan' }));

            const mapa = await client.TryGetProductsByIds(['p1']);

            expect(mapa.get('p1')).toMatchObject({ name: 'Sedan' });
        });

        // Esta es la variante que sostiene "degradacion, no caida".
        it('devuelve un mapa vacio en vez de lanzar cuando el catalogo esta caido', async () => {
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

            await expect(client.TryGetProductsByIds(['p1'])).resolves.toEqual(new Map());

            console.warn.mockRestore();
        });
    });
});
