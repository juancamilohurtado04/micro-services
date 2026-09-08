// shopping no firma tokens ni hashea contrasenas: eso es responsabilidad
// exclusiva de customers. Aqui solo queda el envoltorio de respuestas; la
// verificacion del JWT vive en api/middlewares/auth.js y usa el mismo
// APP_SECRET, pero solo para verificar.
module.exports = {
    FormateData: (data) => ({ data }),
};
