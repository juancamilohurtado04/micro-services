const express = require('express');
const ProductsService = require('../services/products-service');
const router = express.Router();
const service = new ProductsService();

router.get('/', async (req, res, next) => {
    try {
        const { data } = await service.GetProducts();
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const { data } = await service.GetProductById(req.params.id);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
