const { CustomerRepository } = require('../database');
const { FormateData, GeneratePassword, GenerateSalt, GenerateSignature, ValidatePassword } = require('../utils');
const { APIError, BadRequestError } = require('../utils/app-errors');

class CustomerService {
    constructor() {
        this.repository = new CustomerRepository();
    }

    async SignIn(userInputs) {
        const { email, password } = userInputs;

        try {
            const existingCustomer = await this.repository.FindCustomer({ email });

            if (existingCustomer) {
                const validPassword = await ValidatePassword(password, existingCustomer.password, existingCustomer.salt);

                if (validPassword) {
                    const token = await GenerateSignature({ email: existingCustomer.email, _id: existingCustomer._id });
                    return FormateData({ id: existingCustomer._id, token });
                }
            }
            throw new BadRequestError('Invalid credentials');
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('SignInError', 500, err.message);
        }
    }

    async SignUp(userInputs) {
        const { email, password, phone } = userInputs;

        try {
            const salt = await GenerateSalt();
            const hashedPassword = await GeneratePassword(password, salt);

            const existingCustomer = await this.repository.CreateCustomer({ email, password: hashedPassword, phone, salt });

            const token = await GenerateSignature({ email: existingCustomer.email, _id: existingCustomer._id });
            return FormateData({ id: existingCustomer._id, token });
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('SignUpError', 500, err.message);
        }
    }

    async AddNewAddress(_id, { street, postalCode, city, country }) {
        try {
            const address = await this.repository.AddNewAddress(_id, { street, postalCode, city, country });
            return FormateData(address);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async GetProfile({ _id }) {
        try {
            const profile = await this.repository.GetProfile(_id);
            return FormateData(profile);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async GetCustomerSummary(_id) {
        try {
            const profile = await this.repository.GetProfile(_id);
            return FormateData({ cart: profile.cart, wishlist: profile.wishlist, orders: profile.orders });
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async GetWishList(_id) {
        try {
            const wishlist = await this.repository.GetWishList(_id);
            return FormateData(wishlist);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async AddToWishlist(_id, product) {
        try {
            const wishlist = await this.repository.AddToWishlist(_id, product);
            return FormateData(wishlist);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async RemoveFromWishlist(_id, productId) {
        try {
            const wishlist = await this.repository.RemoveFromWishlist(_id, productId);
            return FormateData(wishlist);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async AddToCart(_id, product, qty) {
        try {
            const cart = await this.repository.AddToCart(_id, product, qty);
            return FormateData(cart);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async RemoveFromCart(_id, productId) {
        try {
            const cart = await this.repository.RemoveFromCart(_id, productId);
            return FormateData(cart);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async GetCart(_id) {
        try {
            const cart = await this.repository.GetCart(_id);
            return FormateData(cart);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('Data Not Found', 404, err.message);
        }
    }

    async PlaceOrder(_id, order) {
        try {
            const placedOrder = await this.repository.PlaceOrder(_id, order);
            return FormateData(placedOrder);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('PlaceOrderError', 500, err.message);
        }
    }
}

module.exports = CustomerService;
