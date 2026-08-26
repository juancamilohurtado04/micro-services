const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CustomerSchema = new Schema({
    email: { type: String, unique: true },
    password: String,
    salt: String,
    phone: String,
    address: [
        { type: Schema.Types.ObjectId, ref: 'address', require: true }
    ],
    cart: [
        {
            product: {
                _id: { type: String, require: true },
                name: { type: String },
                desc: { type: String },
                type: { type: String },
                banner: { type: String },
                price: { type: Number },
                available: { type: Boolean },
            },
            unit: { type: Number, require: true }
        }
    ],
    wishlist: [
        {
            _id: { type: String, require: true },
            name: { type: String },
            desc: { type: String },
            type: { type: String },
            banner: { type: String },
            available: { type: Boolean },
            price: { type: Number },
        }
    ],
    orders: [
        {
            _id: { type: String, required: true },
            amount: { type: Number },
            txnId: { type: String },
            status: { type: String, default: 'received' },
            items: [
                {
                    product: { type: Schema.Types.Mixed },
                    unit: { type: Number }
                }
            ],
            date: { type: Date, default: Date.now }
        }
    ]
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret.password;
            delete ret.salt;
            delete ret.__v;
        }
    },
    timestamps: true
});

module.exports = mongoose.model('customer', CustomerSchema);
