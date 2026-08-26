const { ProductRepository } = require('../database');
const { FormateData } = require('../utils');
const { APIError } = require('../utils/app-errors');

class ProductsService {
    constructor() {
        this.repository = new ProductRepository();
    }

    async GetProducts() {
        try {
            const products = await this.repository.FindAll();
            const categories = [...new Set(products.map((product) => product.type))];
            return FormateData({ products, categories });
        } catch (err) {
            throw new APIError('GetProductsError', 500, err.message);
        }
    }

    async GetProductById(id) {
        try {
            const product = await this.repository.FindById(id);
            return FormateData(product);
        } catch (err) {
            if (err instanceof APIError) throw err;
            throw new APIError('GetProductByIdError', 500, err.message);
        }
    }
}

module.exports = ProductsService;
