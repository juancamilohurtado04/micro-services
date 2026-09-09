const { OrderRepository } = require('../database');
const { GetProductsByIds, TryGetProductsByIds } = require('../clients/products-client');
const { FormateData } = require('../utils');
const { APIError, BadRequestError } = require('../utils/app-errors');

class ShoppingService {
    constructor() {
        this.repository = new OrderRepository();
    }

    async CreateOrder({ userId, txnId, items }) {
        try {
            if (!userId) {
                throw new BadRequestError('User id is required');
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                throw new BadRequestError('Order items are required');
            }

            const lineas = items.map((item) => ({
                productId: item?.productId,
                quantity: Number(item?.quantity),
            }));

            if (lineas.some((linea) => !linea.productId)) {
                throw new BadRequestError('Every order item needs a productId');
            }

            if (lineas.some((linea) => !Number.isInteger(linea.quantity) || linea.quantity < 1)) {
                throw new BadRequestError('Every order item needs a quantity of at least 1');
            }

            // El precio lo pone el catalogo, nunca el cliente. Si products esta
            // caido la orden no se crea: se prefiere un 503 honesto a persistir
            // un importe que nadie pudo verificar.
            const catalogo = await GetProductsByIds(lineas.map((linea) => linea.productId));

            const faltantes = lineas.filter((linea) => !catalogo.has(linea.productId));

            if (faltantes.length) {
                throw new BadRequestError(
                    `These products are not in the catalogue: ${faltantes.map((l) => l.productId).join(', ')}`,
                );
            }

            const agotados = lineas.filter((linea) => catalogo.get(linea.productId).available === false);

            if (agotados.length) {
                throw new BadRequestError(
                    `These products are no longer available: ${agotados.map((l) => l.productId).join(', ')}`,
                );
            }

            // Se congela el nombre y el precio del momento de la compra: la
            // orden debe seguir siendo legible aunque products cambie el
            // catalogo despues, y aunque el servicio este apagado.
            const validados = lineas.map((linea) => {
                const producto = catalogo.get(linea.productId);

                return {
                    productId: linea.productId,
                    name: producto.name,
                    price: producto.price,
                    quantity: linea.quantity,
                };
            });

            const amount = validados.reduce((total, linea) => total + linea.price * linea.quantity, 0);

            const createdOrder = await this.repository.CreateOrder({
                userId,
                txnId,
                amount,
                status: 'received',
                items: validados,
                date: new Date(),
            });

            return FormateData(createdOrder);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('CreateOrderError', 500, err.message);
        }
    }

    async GetOrdersByUser(userId) {
        try {
            const orders = await this.repository.FindByUserId(userId);

            // Degradacion, no caida: el enriquecimiento con el precio actual es
            // un extra. Con products apagado el historial se devuelve igual,
            // solo que sin currentProduct.
            const catalogo = await TryGetProductsByIds(
                orders.flatMap((order) => (order.items || []).map((item) => item.productId)),
            );

            const enriquecidas = orders.map((order) => {
                const plano = typeof order.toObject === 'function' ? order.toObject() : { ...order };

                return {
                    ...plano,
                    items: (plano.items || []).map((item) => {
                        const actual = catalogo.get(item.productId);

                        return {
                            ...item,
                            currentProduct: actual
                                ? {
                                      name: actual.name,
                                      price: actual.price,
                                      available: actual.available,
                                      banner: actual.banner,
                                  }
                                : null,
                            priceChanged: actual ? actual.price !== item.price : null,
                        };
                    }),
                };
            });

            return FormateData(enriquecidas);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('GetOrdersByUserError', 500, err.message);
        }
    }
}

module.exports = ShoppingService;
