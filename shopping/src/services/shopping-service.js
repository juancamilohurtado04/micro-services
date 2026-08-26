const mongoose = require('mongoose');
const { OrderRepository } = require('../database');
const { FormateData } = require('../utils');
const { APIError, BadRequestError } = require('../utils/app-errors');

class ShoppingService {
    constructor() {
        this.repository = new OrderRepository();
    }

    async CreateOrder({ userId, txnId, items, amount }) {
        try {
            if (!userId) {
                throw new BadRequestError('User id is required');
            }

            if (!items || !Array.isArray(items) || items.length === 0) {
                throw new BadRequestError('Order items are required');
            }

            if (typeof amount !== 'number' || amount <= 0) {
                throw new BadRequestError('Order amount must be greater than zero');
            }

            const order = {
                _id: new mongoose.Types.ObjectId().toString(),
                userId,
                txnId,
                amount,
                status: 'received',
                items,
                date: new Date(),
            };

            const createdOrder = await this.repository.CreateOrder(order);
            return FormateData(createdOrder);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('CreateOrderError', 500, err.message);
        }
    }

    async GetOrdersByUser(userId) {
        try {
            const orders = await this.repository.FindByUserId(userId);
            return FormateData(orders);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('GetOrdersByUserError', 500, err.message);
        }
    }
}

module.exports = ShoppingService;
