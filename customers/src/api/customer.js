const express = require('express');
const CustomerService = require('../services/customer-service');
const UserAuth = require('./middlewares/auth');
const { BadRequestError } = require('../utils/app-errors');

const router = express.Router();
const service = new CustomerService();

router.post('/signup', async (req, res, next) => {
    try {
        const { email, password, phone } = req.body;
        const { data } = await service.SignUp({ email, password, phone });
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const { data } = await service.SignIn({ email, password });
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.post('/address', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { street, postalCode, city, country } = req.body;
        const { data } = await service.AddNewAddress(_id, { street, postalCode, city, country });
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/profile', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.GetProfile({ _id });
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/summary', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.GetCustomerSummary(_id);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/wishlist', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.GetWishList(_id);
        return res.status(200).json(data);
    } catch (err) {
        next(err);
    }
});

router.put('/wishlist', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { product } = req.body;

        if (!product || !product._id) {
            throw new BadRequestError('A product with an _id is required');
        }

        const { data } = await service.AddToWishlist(_id, product);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.delete('/wishlist/:productId', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.RemoveFromWishlist(_id, req.params.productId);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/cart', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.GetCart(_id);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.put('/cart', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { product, qty } = req.body;

        if (!product || !product._id) {
            throw new BadRequestError('A product with an _id is required');
        }

        const unit = Number(qty);

        if (!Number.isInteger(unit) || unit < 1) {
            throw new BadRequestError('qty must be a positive integer');
        }

        const { data } = await service.AddToCart(_id, product, unit);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

// Placed before '/cart/:productId' so an empty-cart request is not read as a
// delete of the product literally named ':productId'.
router.delete('/cart', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.ClearCart(_id);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

router.delete('/cart/:productId', UserAuth, async (req, res, next) => {
    try {
        const { _id } = req.user;
        const { data } = await service.RemoveFromCart(_id, req.params.productId);
        return res.json(data);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
