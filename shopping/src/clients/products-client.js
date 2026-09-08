// Frontera entre dominios: shopping NO conoce la base de products ni su
// repositorio. Habla con el catalogo por HTTP contra su API publica, igual
// que lo haria cualquier otro consumidor externo.
//
// Todo lo que sale de aqui esta acotado por un timeout: un servicio que no
// responde debe fallar rapido, no dejar la peticion colgada hasta que el
// cliente se rinda.
const { PRODUCTS_URL } = require('../config');
const { ServiceUnavailableError } = require('../utils/app-errors');

const TIMEOUT_MS = 5000;

async function requestProduct(id) {
    const response = await fetch(`${PRODUCTS_URL}/products/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 404 no es una caida del catalogo: es una respuesta valida que significa
    // "ese producto no existe". Se distingue de un fallo de transporte.
    if (response.status === 404) return null;

    if (!response.ok) {
        throw new ServiceUnavailableError(
            `El catalogo respondio ${response.status} al consultar el producto ${id}`,
        );
    }

    return response.json();
}

// Consulta obligatoria: si el catalogo no responde, propaga el fallo. Se usa
// al crear una orden, donde no se puede improvisar un precio.
async function GetProduct(id) {
    try {
        return await requestProduct(id);
    } catch (err) {
        if (err instanceof ServiceUnavailableError) throw err;

        throw new ServiceUnavailableError(
            `El microservicio "products" no esta disponible (${err.message})`,
        );
    }
}

async function GetProductsByIds(ids) {
    const unicos = [...new Set(ids)];
    const encontrados = await Promise.all(unicos.map((id) => GetProduct(id)));

    return new Map(unicos.map((id, i) => [id, encontrados[i]]).filter(([, p]) => p));
}

// Consulta opcional: se usa para enriquecer ordenes ya creadas. Si el catalogo
// esta caido devuelve un mapa vacio en vez de tumbar la peticion — la orden ya
// guardo su propio precio historico y sigue siendo legible sin products.
async function TryGetProductsByIds(ids) {
    try {
        return await GetProductsByIds(ids);
    } catch (err) {
        console.warn(`[shopping] catalogo no disponible, se omite el enriquecimiento: ${err.message}`);
        return new Map();
    }
}

module.exports = { GetProduct, GetProductsByIds, TryGetProductsByIds };
