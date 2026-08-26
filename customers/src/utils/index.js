const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { APP_SECRET } = require('../config');

module.exports = {
    GenerateSalt: async () => bcrypt.genSalt(),

    GeneratePassword: async (password, salt) => bcrypt.hash(password, salt),

    ValidatePassword: async (enteredPassword, savedPassword, salt) =>
        (await bcrypt.hash(enteredPassword, salt)) === savedPassword,

    GenerateSignature: async (payload) => jwt.sign(payload, APP_SECRET, { expiresIn: '1d' }),

    FormateData: (data) => ({ data }),
};
