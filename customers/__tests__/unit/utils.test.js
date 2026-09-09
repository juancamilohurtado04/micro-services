// Pruebas unitarias de los helpers compartidos (hash, firma de tokens y formato).
const jwt = require('jsonwebtoken');
const {
    GenerateSalt,
    GeneratePassword,
    ValidatePassword,
    GenerateSignature,
    FormateData,
} = require('../../src/utils');
const { APP_SECRET } = require('../../src/config');

describe('utils', () => {
    describe('FormateData', () => {
        it('envuelve el payload en la propiedad data', () => {
            expect(FormateData({ _id: 'o1' })).toEqual({ data: { _id: 'o1' } });
        });

        it('conserva los valores vacios tal cual', () => {
            expect(FormateData([])).toEqual({ data: [] });
            expect(FormateData(null)).toEqual({ data: null });
        });
    });

    describe('hash de contrasenas', () => {
        it('genera un salt distinto en cada llamada', async () => {
            const [primero, segundo] = await Promise.all([GenerateSalt(), GenerateSalt()]);

            expect(primero).not.toBe(segundo);
        });

        it('nunca devuelve la contrasena en texto plano', async () => {
            const salt = await GenerateSalt();
            const hash = await GeneratePassword('secreta123', salt);

            expect(hash).not.toBe('secreta123');
            expect(hash.startsWith(salt)).toBe(true);
        });

        it('valida la contrasena correcta y rechaza la incorrecta', async () => {
            const salt = await GenerateSalt();
            const hash = await GeneratePassword('secreta123', salt);

            await expect(ValidatePassword('secreta123', hash, salt)).resolves.toBe(true);
            await expect(ValidatePassword('otra-clave', hash, salt)).resolves.toBe(false);
        });
    });

    describe('GenerateSignature', () => {
        it('firma un JWT verificable con APP_SECRET', async () => {
            const token = await GenerateSignature({ _id: 'user-1', email: 'ana@example.com' });
            const payload = jwt.verify(token, APP_SECRET);

            expect(payload).toMatchObject({ _id: 'user-1', email: 'ana@example.com' });
            expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
        });

        it('produce un token que no se puede verificar con otro secreto', async () => {
            const token = await GenerateSignature({ _id: 'user-1' });

            expect(() => jwt.verify(token, 'otro-secreto')).toThrow();
        });
    });
});
