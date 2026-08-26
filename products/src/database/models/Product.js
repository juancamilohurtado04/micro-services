const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductSchema = new Schema({
    name: { type: String, required: true },
    desc: { type: String },
    type: { type: String, required: true },
    banner: { type: String },
    price: { type: Number, required: true },
    available: { type: Boolean, default: true },
}, {
    timestamps: true
});

module.exports = mongoose.model('product', ProductSchema);
