const { CustomerModel, AddressModel } = require('../models');
const { APIError, BadRequestError } = require('../../utils/app-errors');

class CustomerRepository {
    async CreateCustomer({ email, password, phone, salt }) {
        try {
            return await CustomerModel.create({ email, password, salt, phone });
        } catch (err) {
            if (err.code === 11000) {
                throw new BadRequestError('Email already registered');
            }
            throw new APIError('CreateCustomerError', 500, err.message);
        }
    }

    async FindCustomer({ email }) {
        return CustomerModel.findOne({ email });
    }

    async AddNewAddress(customerId, { street, postalCode, city, country }) {
        const customer = await CustomerModel.findById(customerId);

        if (!customer) {
            throw new BadRequestError('Customer not found');
        }

        const address = await AddressModel.create({ street, postalCode, city, country });
        customer.address.push(address._id);
        await customer.save();

        return address;
    }

    async GetProfile(customerId) {
        return CustomerModel.findById(customerId).populate('address');
    }

    async GetWishList(customerId) {
        const customer = await CustomerModel.findById(customerId);
        return customer.wishlist;
    }

    async AddToWishlist(customerId, product) {
        const customer = await CustomerModel.findById(customerId);
        const productId = product._id.toString();

        if (!customer.wishlist.some((item) => item._id === productId)) {
            customer.wishlist.push({ ...product, _id: productId });
            await customer.save();
        }

        return customer.wishlist;
    }

    async RemoveFromWishlist(customerId, productId) {
        const customer = await CustomerModel.findById(customerId);
        customer.wishlist = customer.wishlist.filter((item) => item._id !== productId);
        await customer.save();

        return customer.wishlist;
    }

    async AddToCart(customerId, product, qty) {
        const customer = await CustomerModel.findById(customerId);
        const productId = product._id.toString();
        const existingItem = customer.cart.find((item) => item.product._id === productId);

        if (existingItem) {
            existingItem.unit = qty;
        } else {
            customer.cart.push({ product: { ...product, _id: productId }, unit: qty });
        }

        await customer.save();
        return customer.cart;
    }

    async RemoveFromCart(customerId, productId) {
        const customer = await CustomerModel.findById(customerId);
        customer.cart = customer.cart.filter((item) => item.product._id !== productId);
        await customer.save();

        return customer.cart;
    }

    async GetCart(customerId) {
        const customer = await CustomerModel.findById(customerId);

        if (!customer) {
            throw new BadRequestError('Customer not found');
        }

        return customer.cart;
    }

    async PlaceOrder(customerId, order) {
        const customer = await CustomerModel.findById(customerId);

        if (!customer) {
            throw new BadRequestError('Customer not found');
        }

        customer.orders.push(order);
        customer.cart = [];
        await customer.save();

        return order;
    }
}

module.exports = CustomerRepository;
