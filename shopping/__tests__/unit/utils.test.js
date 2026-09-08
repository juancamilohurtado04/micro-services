// shopping no tiene helpers de criptografia: no firma tokens ni hashea
// contrasenas, porque no es su dominio. Lo unico que queda aqui es el
// envoltorio de respuestas.
const utils = require('../../src/utils');
const { FormateData } = utils;

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

    // Esta prueba es la que defiende la regla "solo customers firma". Si
    // alguien vuelve a copiar los helpers del monolito, falla aqui.
    describe('frontera de responsabilidades', () => {
        it('no expone ningun helper capaz de firmar tokens ni de hashear', () => {
            expect(Object.keys(utils)).toEqual(['FormateData']);
        });

        it('no declara bcryptjs como dependencia', () => {
            const { dependencies } = require('../../package.json');

            expect(dependencies).not.toHaveProperty('bcryptjs');
        });

        it('usa jsonwebtoken solo para verificar, nunca para firmar', () => {
            const fs = require('fs');
            const path = require('path');

            const archivos = [];
            const recorrer = (dir) => {
                for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
                    const completo = path.join(dir, entrada.name);
                    if (entrada.isDirectory()) recorrer(completo);
                    else if (entrada.name.endsWith('.js')) archivos.push(completo);
                }
            };
            recorrer(path.join(__dirname, '..', '..', 'src'));

            const firmantes = archivos.filter((archivo) =>
                fs.readFileSync(archivo, 'utf8').includes('jwt.sign'),
            );

            expect(firmantes).toEqual([]);
        });
    });
});
