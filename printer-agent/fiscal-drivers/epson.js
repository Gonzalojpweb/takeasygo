// ============================================================================
// Driver Epson — controladores fiscales 2da generación (TM-T900FA, Vesta)
// ============================================================================
// Habla con el equipo a través de la DLL oficial EpsonFiscalDriver (SDK
// 3.07.00) usando epson-bridge.ps1. Comandos: epson-commands.js.
//
// Informes: X (salida de cajero) y Z (cierre de jornada, irreversible). Si se
// corta durante un Z se verifica con el contador de cierres; nunca se reenvía.
//
// Alcance (02/11/2026): TIQUE a consumidor final (sin identificar). El Tique
// Factura A/B (0B) y la Nota de Crédito quedan pendientes: se rechazan sin
// enviar nada al equipo.
//
// Seguridad fiscal:
//   1. Antes de emitir: estado del equipo. Con un documento abierto, papel o
//      tapa con problemas, o en MODO FISCAL sin habilitación explícita
//      (config.json → epson.allowFiscalMode), NO se emite.
//   2. Se anota el último tique completado (08 30) antes de emitir.
//   3. Si el equipo rechaza un dato después de abrir el tique ⇒ se cancela
//      (0A 07). Si se corta la comunicación ⇒ RECUPERACIÓN: si el contador
//      subió, el tique salió (se informa con su número); si quedó abierto, se
//      cancela; si no se puede saber ⇒ 'unknown' (nunca se reemite solo).
//
// Configuración (config.json del agente, todo opcional):
//   "epson": { "dllPath": "C:\\TakeasyGo\\printer-agent\\fiscal-drivers\\epson\\EpsonFiscalDriver.dll",
//              "allowFiscalMode": false, "baudRate": 9600 }
// ============================================================================

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DriverUnavailableError } = require('./index');
const C = require('./epson-commands');

const BRIDGE = path.join(__dirname, 'epson-bridge.ps1');
const BRIDGE_TIMEOUT_MS = 90_000;

function loadConfig() {
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
        return cfg.epson || {};
    } catch {
        return {};
    }
}

function portFor(device, cfg) {
    const connection = (device && device.connection) || 'usb';
    if (connection === 'usb') return 'usb:usb';
    if (connection === 'serial') {
        const [port, baud] = String(device.address || '').split(',');
        if (!/^COM\d+$/i.test(port || '')) throw new DriverUnavailableError('Conexión serie sin puerto COM válido (ej. COM3)');
        return `serial:${port.toUpperCase()},${Number(baud) || Number(cfg.baudRate) || 9600}`;
    }
    // La conexión por red solo existe en firmware Jano/Neptuno (ejemplo oficial).
    throw new DriverUnavailableError('La TM-T900FA con firmware Vesta se conecta por USB o serie, no por red');
}

/** Ejecuta comandos en UNA sesión con el equipo. Lanza si el puente no respondió. */
function runBridge(dllPath, port, commands, stopOnError) {
    const file = path.join(os.tmpdir(), `tgo-epson-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ commands, stopOnError }));
    return new Promise((resolve, reject) => {
        execFile(
            'powershell',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BRIDGE, '-DllPath', dllPath, '-Port', port, '-InputFile', file],
            { timeout: BRIDGE_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
            (err, stdout) => {
                try { fs.unlinkSync(file); } catch { /* ignorar */ }
                const line = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
                if (err && !line) {
                    const e = new Error(err.killed ? 'El equipo no respondió a tiempo' : `No se pudo ejecutar el puente de Epson: ${err.message}`);
                    e.uncertain = true;
                    return reject(e);
                }
                try {
                    resolve(JSON.parse(line));
                } catch {
                    const e = new Error('Respuesta ilegible del puente de Epson');
                    e.uncertain = true;
                    reject(e);
                }
            }
        );
    });
}

// Reemplazable solo en las pruebas (sin DLL ni equipo).
let bridge = runBridge

const hex = (n) => `0x${(Number(n) >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;

function findResult(res, cmd) {
    return (res.results || []).find((r) => r.command === cmd) || null;
}

/** Último tique COMPLETADO según 08 30 (campo de salida 6). */
function lastCompleted(res) {
    const r = findResult(res, C.CMD.COUNTERS);
    if (!r || r.dllError !== 0 || r.returnCode !== 0) return null;
    const n = Number((r.fields || [])[5]);
    return Number.isInteger(n) ? n : null;
}

/** Último cierre Z según 08 30 (campo de salida 1). */
function lastZReport(res) {
    const r = findResult(res, C.CMD.COUNTERS);
    if (!r || r.dllError !== 0 || r.returnCode !== 0) return null;
    const n = Number((r.fields || [])[0]);
    return Number.isInteger(n) ? n : null;
}

async function precheck(dllPath, port, cfg) {
    const res = await bridge(dllPath, port, [`${C.CMD.STATUS}|0000`, `${C.CMD.COUNTERS}|0000|${C.DOC_TYPE.TIQUE}`], false);
    if (res.setupError) throw new DriverUnavailableError(res.setupError);
    if (!res.opened) {
        const e = new Error(`No se pudo abrir la comunicación con la impresora fiscal (${hex(res.dllError)}). Revisar el cable USB y que esté encendida.`);
        e.beforeSend = true;
        throw e;
    }
    const status = findResult(res, C.CMD.STATUS);
    if (!status || status.dllError !== 0) {
        const e = new Error('La impresora fiscal no respondió al pedido de estado');
        e.beforeSend = true;
        throw e;
    }
    const fiscal = C.decodeFiscalStatus(status.fiscalStatus);
    const printer = C.decodePrinterStatus(status.printerStatus);
    const refuse = (msg) => Object.assign(new Error(msg), { beforeSend: true });
    if (fiscal.mode === 'fiscal' && !cfg.allowFiscalMode) {
        throw refuse('El equipo está en MODO FISCAL (comprobantes con validez legal). Para emitir hay que habilitarlo en config.json del agente (epson.allowFiscalMode). No se envió nada.');
    }
    if (fiscal.mode !== 'entrenamiento' && fiscal.mode !== 'fiscal') throw refuse(`El equipo está en modo ${fiscal.mode}: no puede emitir`);
    if (fiscal.documentInProgress !== 0) throw refuse('Hay un documento abierto en la impresora fiscal. Cerrarlo o cancelarlo antes de emitir.');
    if (fiscal.fiscalMemory >= 2 || fiscal.transactionMemory >= 2) throw refuse('La memoria fiscal o de transacciones está llena o con desperfectos');
    if (printer.offline || printer.error || printer.coverOpen) throw refuse('La impresora fiscal está fuera de línea, con error o con la tapa abierta');
    return { fiscal, lastBefore: lastCompleted(res), lastZ: lastZReport(res) };
}

/** Después de un corte: ¿salió el tique? */
async function recover(dllPath, port, lastBefore, cause) {
    let res;
    try {
        res = await bridge(dllPath, port, [`${C.CMD.STATUS}|0000`, `${C.CMD.COUNTERS}|0000|${C.DOC_TYPE.TIQUE}`], false);
    } catch {
        return { outcome: 'unknown', errorMsg: `${cause}. No se pudo consultar el equipo después: verificar el papel y la memoria fiscal antes de reintentar.` };
    }
    if (!res.opened) return { outcome: 'unknown', errorMsg: `${cause}. El equipo no responde: verificar antes de reintentar.` };
    const status = findResult(res, C.CMD.STATUS);
    const fiscal = status && status.dllError === 0 ? C.decodeFiscalStatus(status.fiscalStatus) : null;
    if (fiscal && fiscal.documentInProgress !== 0) {
        const cancel = await bridge(dllPath, port, [`${C.CMD.TICKET_CANCEL}|0000`], true).catch(() => null);
        const ok = cancel && cancel.opened && (cancel.results || [])[0] && cancel.results[0].returnCode === 0;
        return ok
            ? { outcome: 'failed', errorMsg: `${cause}. El tique quedó abierto y se canceló: no se emitió.` }
            : { outcome: 'unknown', errorMsg: `${cause}. El tique quedó abierto y no se pudo cancelar: revisar el equipo.` };
    }
    const after = lastCompleted(res);
    if (after !== null && lastBefore !== null && after > lastBefore) {
        return {
            outcome: 'confirmed',
            result: { documentType: 'TIQUE', number: after, totalCents: null, raw: `Recuperado por contadores (08 30): último completado ${lastBefore} → ${after}` },
        };
    }
    if (after !== null && lastBefore !== null && after === lastBefore) {
        return { outcome: 'failed', errorMsg: `${cause}. El contador no cambió: el tique no se emitió.` };
    }
    return { outcome: 'unknown', errorMsg: `${cause}. No se pudo determinar si el tique salió.` };
}

/** Después de un corte durante un informe: ¿se hizo el Z? El X no deja contador. */
async function recoverReport(dllPath, port, kind, lastZ, cause) {
    if (kind !== 'z') {
        return { outcome: 'unknown', errorMsg: `${cause}. Mirá si salió el papel; una salida de cajero se puede repetir.` };
    }
    let res;
    try {
        res = await bridge(dllPath, port, [`${C.CMD.STATUS}|0000`, `${C.CMD.COUNTERS}|0000|${C.DOC_TYPE.TIQUE}`], false);
    } catch {
        return { outcome: 'unknown', errorMsg: `${cause}. No se pudo consultar el equipo: NO pidas otro Z sin verificar.` };
    }
    const after = res.opened ? lastZReport(res) : null;
    if (after !== null && lastZ !== null && after > lastZ) {
        return { outcome: 'confirmed', result: { documentType: 'CIERRE Z', number: after, raw: `Recuperado por contadores (08 30): Z ${lastZ} → ${after}` } };
    }
    if (after !== null && after === lastZ) return { outcome: 'failed', errorMsg: `${cause}. El contador no cambió: el Z no se hizo.` };
    return { outcome: 'unknown', errorMsg: `${cause}. No se pudo determinar si el Z se hizo: NO pidas otro sin verificar.` };
}

async function runReport(dllPath, port, cfg, kind) {
    const { fiscal, lastZ } = await precheck(dllPath, port, cfg);
    if (kind === 'z' && !fiscal.dayOpen) {
        throw Object.assign(new Error('La jornada fiscal ya está cerrada: no hay nada para cerrar. Se abre con el primer tique.'), { beforeSend: true });
    }
    const documentType = kind === 'z' ? 'CIERRE Z' : 'SALIDA DE CAJERO';
    let res;
    try {
        res = await bridge(dllPath, port, [C.buildReportCommand(kind)], true);
    } catch (e) {
        return recoverReport(dllPath, port, kind, lastZ, e.message);
    }
    if (res.setupError) throw new DriverUnavailableError(res.setupError);
    if (!res.opened) return { outcome: 'failed', errorMsg: `No se pudo abrir la comunicación con la impresora fiscal (${hex(res.dllError)})` };
    const r = (res.results || [])[0];
    if (!r || r.dllError !== 0) {
        return recoverReport(dllPath, port, kind, lastZ, `Error de comunicación${r ? ` ${hex(r.dllError)}` : ''} durante el informe`);
    }
    if (r.returnCode !== 0) return { outcome: 'failed', errorMsg: `El equipo rechazó el informe (código ${hex(r.returnCode)})` };
    const number = Number((r.fields || [])[0]);
    if (!Number.isInteger(number) || number <= 0) {
        return recoverReport(dllPath, port, kind, lastZ, 'El equipo hizo el informe pero no informó el número');
    }
    return { outcome: 'confirmed', result: { documentType, number, raw: `${documentType} ${number}` } };
}

async function execute(device, operation, payload) {
    if (operation === 'x_report' || operation === 'z_report') {
        const cfg = loadConfig();
        const dllPath = cfg.dllPath || path.join(__dirname, 'epson', 'EpsonFiscalDriver.dll');
        return runReport(dllPath, portFor(device, cfg), cfg, operation === 'z_report' ? 'z' : 'x');
    }
    if (operation !== 'invoice') {
        throw new DriverUnavailableError(`La operación «${operation}» todavía no está implementada para Epson`);
    }
    const receiver = (payload && payload.receiver) || {};
    if (receiver.condition !== 'consumidor_final' || (receiver.docType && receiver.docType !== 99)) {
        throw new DriverUnavailableError('Tique Factura A/B (cliente identificado) todavía no implementado para Epson: solo consumidor final');
    }

    const cfg = loadConfig();
    const dllPath = cfg.dllPath || path.join(__dirname, 'epson', 'EpsonFiscalDriver.dll');
    const port = portFor(device, cfg);
    let commands;
    try {
        commands = C.buildTicketCommands(payload);
    } catch (e) {
        // Dato inválido: todavía no se tocó el equipo.
        throw Object.assign(new Error(`Venta con datos inválidos para la impresora fiscal: ${e.message}`), { beforeSend: true });
    }

    const { lastBefore } = await precheck(dllPath, port, cfg);

    let res;
    try {
        res = await bridge(dllPath, port, commands, true);
    } catch (e) {
        return recover(dllPath, port, lastBefore, e.message);
    }
    if (res.setupError) throw new DriverUnavailableError(res.setupError);
    if (!res.opened) {
        return { outcome: 'failed', errorMsg: `No se pudo abrir la comunicación con la impresora fiscal (${hex(res.dllError)})` };
    }

    const results = res.results || [];
    const failed = results.find((r) => r.dllError !== 0 || r.returnCode !== 0);
    const close = findResult(res, C.CMD.TICKET_CLOSE);
    if (!failed && close) {
        const f = close.fields || [];
        const number = Number(f[0]);
        if (!Number.isInteger(number) || number <= 0) {
            // Cerró bien pero sin número: se lee de los contadores (08 30).
            return recover(dllPath, port, lastBefore, 'El equipo cerró el tique pero no informó el número');
        }
        return {
            outcome: 'confirmed',
            result: {
                documentType: 'TIQUE',
                number,
                totalCents: Number.isInteger(Number(f[1])) ? Number(f[1]) : undefined,
                raw: `Tique ${f[0]} · total ${f[1] || '?'} · IVA ${f[2] || '?'}`,
            },
        };
    }

    if (failed && failed.dllError !== 0) {
        // Se cortó la comunicación en medio de la emisión.
        return recover(dllPath, port, lastBefore, `Error de comunicación ${hex(failed.dllError)} en el comando ${failed.command}`);
    }

    const reason = failed
        ? `El equipo rechazó el comando ${failed.command} (código ${hex(failed.returnCode)})`
        : 'La emisión terminó sin cerrar el tique';
    if (failed && failed.command === C.CMD.TICKET_OPEN) {
        return { outcome: 'failed', errorMsg: `${reason}. No se abrió el tique.` };
    }
    // El tique quedó abierto: se cancela para no dejar el equipo trabado.
    return recover(dllPath, port, lastBefore, reason);
}

module.exports = {
    brand: 'epson',
    /** Modelos/firmware probados FÍSICAMENTE: completar después de la prueba. */
    validatedModels: [],
    execute,
    /** Solo pruebas: simula la DLL. */
    __setBridgeForTests(fn) { bridge = fn || runBridge; },
};
