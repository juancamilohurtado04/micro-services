const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderSchema = new Schema({
    userId: { type: String, required: true, index: true },
    txnId: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, default: 'received' },
    items: [{
        productId: { type: String, required: true },
        name: { type: String },
        price: { type: Number },
        quantity: { type: Number, required: true },
    }],
    date: { type: Date, default: Date.now },
}, {
    timestamps: true,
});

module.exports = mongoose.model('order', OrderSchema);
