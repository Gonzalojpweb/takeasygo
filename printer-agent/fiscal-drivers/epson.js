// ============================================================================
// Driver Epson (controladores fiscales homologados) — NO IMPLEMENTADO
// ============================================================================
// Orden de ejecución 31/10 (fase 3). El lunes habrá equipos Epson, pero al
// 31/10/2026 no se conoce el modelo exacto ni se dispone del manual técnico
// vigente ni del SDK/DLL oficial del fabricante. Sin eso, cualquier comando
// sería inventado: este driver NO envía nada al equipo y lo informa así.
//
// Para implementarlo hace falta (por modelo):
//   · modelo exacto y versión de firmware (p. ej. de la línea TM-T900FA);
//   · manual técnico / guía de comandos vigente de Epson Argentina;
//   · SDK o biblioteca oficial (Windows) y su licencia de uso;
//   · interfaz de conexión del equipo de prueba (USB/serie/red);
//   · modo de pruebas autorizado por el fabricante (sin efectos fiscales).
// Luego: implementar execute() según index.js, completar validatedModels con
// lo probado físicamente y quitar el error.
// ============================================================================

const { DriverUnavailableError } = require('./index');

module.exports = {
    brand: 'epson',
    validatedModels: [],
    async execute() {
        throw new DriverUnavailableError(
            'Driver Epson no implementado: falta el modelo exacto, el manual técnico y el SDK oficial. No se envió nada al equipo.'
        );
    },
};
