const express = require('express');
const ShoppingService = require('../services/shopping-service');
const UserAuth = require('./middlewares/auth');

const router = express.Router();
const service = new ShoppingService();

router.post('/order', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { txnId, items, amount } = req.body;
        const { data } = await service.CreateOrder({ userId: _id, txnId, items, amount });
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/orders', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.GetOrdersByUser(_id);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
