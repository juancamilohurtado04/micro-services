// Levanta microservicios "stub" reales en puertos efimeros para que las pruebas
// de integracion del gateway ejerciten proxy y composicion sobre HTTP de verdad,
// sin mockear fetch ni express-http-proxy.
const express = require('express');

const startStub = (configure) =>
    new Promise((resolve, reject) => {
        const app = express();
        app.use(express.json());

        const recibidas = [];

        // Registro de peticiones para poder afirmar que el gateway reenvia
        // la ruta y las cabeceras correctas.
        app.use((req, res, next) => {
            recibidas.push({ method: req.method, url: req.url, headers: req.headers });
            next();
        });

        configure(app);

        const server = app.listen(0, '127.0.0.1', () => {
            resolve({
                server,
                recibidas,
                url: `http://127.0.0.1:${server.address().port}`,
                close: () => new Promise((done) => server.close(done)),
            });
        });

        server.on('error', reject);
    });

// Devuelve la URL de un puerto libre donde no hay nada escuchando:
// sirve para simular un microservicio caido.
const deadServiceUrl = () =>
    new Promise((resolve) => {
        const server = express().listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(`http://127.0.0.1:${port}`));
        });
    });

module.exports = { startStub, deadServiceUrl };
