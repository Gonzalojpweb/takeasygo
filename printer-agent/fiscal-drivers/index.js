// ============================================================================
// Drivers de controladores fiscales homologados — orden 31/10 (fase 3)
// ============================================================================
// El servidor manda operaciones fiscales (FiscalControllerJob) y el agente
// las ejecuta con el driver de la MARCA del equipo (device.brand).
//
// CONTRATO de un driver (un archivo por familia de equipos):
//
//   module.exports = {
//     brand: 'epson',
//     /** Modelos/firmware validados FÍSICAMENTE con este driver. */
//     validatedModels: [],
//     /**
//      * Ejecuta la operación con la interfaz DOCUMENTADA del fabricante
//      * (SDK oficial, DLL o protocolo del manual técnico vigente).
//      * Devuelve:
//      *   { outcome: 'confirmed', result: { documentType, pointOfSale, number,
//      *     issuedAt, totalCents, raw } }   ← SOLO con el número que informa
//      *                                       el equipo
//      *   { outcome: 'failed', errorMsg }    ← seguro que el equipo NO emitió
//      *   { outcome: 'unknown', errorMsg }   ← pudo haber emitido
//      * Si lanza una excepción, el agente informa 'unknown' salvo que el
//      * error tenga `beforeSend = true` (nada llegó al equipo).
//      */
//     async execute(device, operation, payload) { … },
//   }
//
// Operaciones: 'invoice', 'credit_note', 'status' (consultar estado) y
// 'query_last' (último comprobante emitido: reconciliación de un resultado
// desconocido). Una operación que el equipo no soporte se informa 'failed'
// con el motivo: NO se inventa.
//
// ESTADO (31/10/2026): ningún driver implementado ni validado. Falta, por
// fabricante: modelo exacto, firmware, manual técnico vigente y SDK oficial.
// ============================================================================

const path = require('path');
const fs = require('fs');

const BRAND_RE = /^[a-z0-9-]{2,40}$/;

class DriverUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DriverUnavailableError';
        this.beforeSend = true;
    }
}

/** Driver de la marca, o lanza DriverUnavailableError (nada se envía al equipo). */
function loadDriver(brand) {
    const key = String(brand || '').toLowerCase();
    if (!BRAND_RE.test(key)) throw new DriverUnavailableError(`Marca de controlador inválida: "${brand}"`);
    const file = path.join(__dirname, `${key}.js`);
    if (!fs.existsSync(file)) {
        throw new DriverUnavailableError(`No hay driver para controladores "${key}" en este agente`);
    }
    const driver = require(file);
    if (!driver || typeof driver.execute !== 'function') {
        throw new DriverUnavailableError(`El driver "${key}" no implementa execute()`);
    }
    return driver;
}

module.exports = { loadDriver, DriverUnavailableError };
