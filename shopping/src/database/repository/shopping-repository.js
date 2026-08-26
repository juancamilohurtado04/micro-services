const { OrderModel } = require('../models');
const { NotFoundError } = require('../../utils/app-errors');

class OrderRepository {
    async CreateOrder(order) {
        return OrderModel.create(order);
    }

    async FindById(id) {
        const order = await OrderModel.findById(id);

        if (!order) {
            throw new NotFoundError('Order not found');
        }

        return order;
    }

    async FindByUserId(userId) {
        return OrderModel.find({ userId }).sort({ createdAt: -1 });
    }
}

module.exports = OrderRepository;
