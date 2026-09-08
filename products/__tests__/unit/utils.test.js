// products solo expone el helper de formato de respuesta.
const { FormateData } = require('../../src/utils');

describe('FormateData', () => {
    it('envuelve el payload en la propiedad data', () => {
        expect(FormateData({ products: [], categories: [] })).toEqual({
            data: { products: [], categories: [] },
        });
    });

    it('conserva arreglos y valores nulos tal cual', () => {
        expect(FormateData([])).toEqual({ data: [] });
        expect(FormateData(null)).toEqual({ data: null });
    });
});
