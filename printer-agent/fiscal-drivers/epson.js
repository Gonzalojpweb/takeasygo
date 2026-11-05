// ============================================================================
// Driver Epson — controladores fiscales 2da generación (TM-T900FA, Vesta)
// ============================================================================
// Habla con el equipo a través de la DLL oficial EpsonFiscalDriver (SDK
// 3.07.00) usando epson-bridge.ps1. Comandos: epson-commands.js.
//
// Documentos: Tique (consumidor final), Tique Factura A/B/C (cliente
// identificado) y sus notas de crédito. Informes: X (salida de cajero) y Z
// (cierre de jornada, irreversible).
//
// Seguridad fiscal:
//   1. Antes de emitir: estado del equipo. Con un documento abierto, papel o
//      tapa con problemas, o en MODO FISCAL sin habilitación explícita
//      (config.json → epson.allowFiscalMode), NO se emite.
//   2. Se anotan los últimos documentos completados (08 30) antes de emitir.
//   3. Si el equipo rechaza un dato después de abrir ⇒ se cancela. Si se corta
//      la comunicación ⇒ RECUPERACIÓN: si un contador subió, el documento salió
//      (se informa con su número); si quedó abierto, se cancela; si no se puede
//      saber ⇒ 'unknown' (nunca se reemite solo).
//
// La condición de IVA y el punto de venta se leen DEL EQUIPO (05 07): es quien
// va a emitir y valida contra esos datos.
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
/** Un mes de Cinta Testigo puede pesar: la descarga va por partes. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const REPORTS_DIR = path.join(__dirname, '..', 'reportes-fiscales');

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
    const download = !Array.isArray(commands);
    fs.writeFileSync(file, JSON.stringify(download ? { download: commands } : { commands, stopOnError }));
    return new Promise((resolve, reject) => {
        execFile(
            'powershell',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BRIDGE, '-DllPath', dllPath, '-Port', port, '-InputFile', file],
            { timeout: download ? DOWNLOAD_TIMEOUT_MS : BRIDGE_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
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
let bridge = runBridge;

const hex = (n) => `0x${(Number(n) >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;

function findResult(res, cmd) {
    return (res.results || []).find((r) => r.command === cmd) || null;
}

/** Consulta de contadores de varios tipos de documento (una por tipo, en orden). */
function counterCommands(types) {
    return types.map((t) => `${C.CMD.COUNTERS}|0000|${t}`);
}

/** { tipo: último completado } según 08 30 (campo de salida 6). null si no se pudo leer. */
function readCounters(res, types) {
    const rows = (res.results || []).filter((r) => r.command === C.CMD.COUNTERS);
    const out = {};
    for (let i = 0; i < types.length; i++) {
        const r = rows[i];
        if (!r || r.dllError !== 0 || r.returnCode !== 0) return null;
        const n = Number((r.fields || [])[5]);
        if (!Number.isInteger(n)) return null;
        out[types[i]] = n;
    }
    return out;
}

/** Último cierre Z según 08 30 (campo de salida 1). */
function lastZReport(res) {
    const r = findResult(res, C.CMD.COUNTERS);
    if (!r || r.dllError !== 0 || r.returnCode !== 0) return null;
    const n = Number((r.fields || [])[0]);
    return Number.isInteger(n) ? n : null;
}

/** Datos fiscales DEL EQUIPO (05 07): punto de venta y condición de IVA. */
function readFiscalData(res) {
    const r = findResult(res, C.CMD.FISCAL_DATA);
    if (!r || r.dllError !== 0 || r.returnCode !== 0) return { pointOfSale: null, issuerIvaCondition: null };
    const f = r.fields || [];
    const pos = Number(f[2]);
    const code = String(f[3] || '').trim().toUpperCase();
    return {
        pointOfSale: Number.isInteger(pos) && pos > 0 ? pos : null,
        issuerIvaCondition: code === 'I' ? 'responsable_inscripto' : code ? 'no_responsable_inscripto' : null,
    };
}

async function precheck(dllPath, port, cfg, types, options = {}) {
    const res = await bridge(dllPath, port, [`${C.CMD.STATUS}|0000`, `${C.CMD.FISCAL_DATA}|0000`, ...counterCommands(types)], false);
    if (res.setupError) throw new DriverUnavailableError(res.setupError);
    if (!res.opened) {
        const e = new Error(`No se pudo abrir la comunicación con la impresora fiscal (${hex(res.dllError)}). Revisar el cable USB, que esté encendida y que no haya otro programa usándola. Si sigue, ejecutar DIAGNOSTICO.bat en la PC de caja.`);
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
    if (fiscal.mode === 'fiscal' && !cfg.allowFiscalMode && !options.readOnly) {
        throw refuse('El equipo está en MODO FISCAL (comprobantes con validez legal). Para emitir hay que habilitarlo en config.json del agente (epson.allowFiscalMode). No se envió nada.');
    }
    if (fiscal.mode !== 'entrenamiento' && fiscal.mode !== 'fiscal') throw refuse(`El equipo está en modo ${fiscal.mode}: no puede emitir`);
    if (fiscal.documentInProgress !== 0) throw refuse('Hay un documento abierto en la impresora fiscal. Cerrarlo o cancelarlo antes de emitir.');
    if (fiscal.fiscalMemory >= 2 || fiscal.transactionMemory >= 2) throw refuse('La memoria fiscal o de transacciones está llena o con desperfectos');
    if (printer.offline || printer.error || printer.coverOpen) throw refuse('La impresora fiscal está fuera de línea, con error o con la tapa abierta');
    return { fiscal, before: readCounters(res, types), lastZ: lastZReport(res), data: readFiscalData(res) };
}

/** Después de un corte o un rechazo: ¿salió el documento? */
async function recover(dllPath, port, klass, before, pointOfSale, cause) {
    const cls = C.DOCUMENT_CLASSES[klass];
    const types = Object.keys(cls.counters).map(Number);
    let res;
    try {
        res = await bridge(dllPath, port, [`${C.CMD.STATUS}|0000`, ...counterCommands(types)], false);
    } catch {
        return { outcome: 'unknown', errorMsg: `${cause}. No se pudo consultar el equipo después: verificar el papel y la memoria fiscal antes de reintentar.` };
    }
    if (!res.opened) return { outcome: 'unknown', errorMsg: `${cause}. El equipo no responde: verificar antes de reintentar.` };
    const status = findResult(res, C.CMD.STATUS);
    const fiscal = status && status.dllError === 0 ? C.decodeFiscalStatus(status.fiscalStatus) : null;
    if (fiscal && fiscal.documentInProgress !== 0) {
        const cancelCmd = C.CANCEL_BY_IN_PROGRESS[fiscal.documentInProgress];
        const cancel = cancelCmd ? await bridge(dllPath, port, [`${cancelCmd}|0000`], true).catch(() => null) : null;
        const ok = cancel && cancel.opened && (cancel.results || [])[0] && cancel.results[0].returnCode === 0;
        return ok
            ? { outcome: 'failed', errorMsg: `${cause}. El documento quedó abierto y se canceló: no se emitió.` }
            : { outcome: 'unknown', errorMsg: `${cause}. El documento quedó abierto y no se pudo cancelar: revisar el equipo.` };
    }
    const after = readCounters(res, types);
    if (after && before) {
        const risen = types.find((t) => after[t] > before[t]);
        if (risen !== undefined) {
            return {
                outcome: 'confirmed',
                result: {
                    documentType: cls.counters[risen],
                    pointOfSale,
                    number: after[risen],
                    raw: `Recuperado por contadores (08 30): ${before[risen]} → ${after[risen]}`,
                },
            };
        }
        return { outcome: 'failed', errorMsg: `${cause}. Los contadores no cambiaron: no se emitió.` };
    }
    return { outcome: 'unknown', errorMsg: `${cause}. No se pudo determinar si el documento salió.` };
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
    const { fiscal, lastZ } = await precheck(dllPath, port, cfg, [C.DOC_TYPE.TIQUE]);
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

/** Nombre del documento con la letra que devolvió el equipo. */
function documentTypeName(cls, letter) {
    const names = Object.values(cls.counters);
    if (names.length === 1) return names[0];
    const match = names.find((n) => n.endsWith(` ${letter}`));
    return match || names[0].replace(/ [A-Z]$/, letter ? ` ${letter}` : '');
}

async function runDocument(dllPath, port, cfg, kind, payload) {
    const klass = C.documentClassFor(payload && payload.receiver, kind);
    const cls = C.DOCUMENT_CLASSES[klass];
    const types = Object.keys(cls.counters).map(Number);
    const { before, data, fiscal } = await precheck(dllPath, port, cfg, types);
    // Modo entrenamiento: sin validez fiscal. Queda marcado para no contarlo.
    const finish = (out) => {
        if (out.result && fiscal.mode === 'entrenamiento') out.result.training = true;
        return out;
    };

    let commands;
    try {
        commands = C.buildDocumentCommands(
            { ...payload, issuerIvaCondition: data.issuerIvaCondition || (payload && payload.issuerIvaCondition) },
            { kind, pointOfSale: data.pointOfSale }
        );
    } catch (e) {
        // Dato inválido: todavía no se tocó el equipo.
        throw Object.assign(new Error(`Venta con datos inválidos para la impresora fiscal: ${e.message}`), { beforeSend: true });
    }

    let res;
    try {
        res = await bridge(dllPath, port, commands, true);
    } catch (e) {
        return finish(await recover(dllPath, port, klass, before, data.pointOfSale, e.message));
    }
    if (res.setupError) throw new DriverUnavailableError(res.setupError);
    if (!res.opened) {
        return { outcome: 'failed', errorMsg: `No se pudo abrir la comunicación con la impresora fiscal (${hex(res.dllError)})` };
    }

    const results = res.results || [];
    const failed = results.find((r) => r.dllError !== 0 || r.returnCode !== 0);
    const close = findResult(res, `${cls.prefix}06`);
    if (!failed && close) {
        const f = close.fields || [];
        const number = Number(f[cls.numberField]);
        if (!Number.isInteger(number) || number <= 0) {
            // Cerró bien pero sin número: se lee de los contadores (08 30).
            return finish(await recover(dllPath, port, klass, before, data.pointOfSale, 'El equipo cerró el documento pero no informó el número'));
        }
        const letter = cls.letterField !== undefined ? String(f[cls.letterField] || '').trim() : '';
        const total = Number(f[cls.totalField]);
        const expected = Number(payload && payload.totalCents);
        // El comprobante YA se emitió: una diferencia se avisa, no lo invalida.
        const mismatch = Number.isInteger(total) && Number.isInteger(expected) && Math.abs(total - expected) > 1
            ? `El total del comprobante ($${(total / 100).toFixed(2)}) no coincide con la venta ($${(expected / 100).toFixed(2)}).`
            : null;
        return finish({
            outcome: 'confirmed',
            result: {
                documentType: documentTypeName(cls, letter),
                pointOfSale: data.pointOfSale,
                number,
                totalCents: Number.isInteger(total) ? total : undefined,
                raw: `${documentTypeName(cls, letter)} ${number} · total ${f[cls.totalField] || '?'}`,
            },
            errorMsg: mismatch,
        });
    }

    if (failed && failed.dllError !== 0) {
        // Se cortó la comunicación en medio de la emisión.
        return finish(await recover(dllPath, port, klass, before, data.pointOfSale, `Error de comunicación ${hex(failed.dllError)} en el comando ${failed.command}`));
    }

    const reason = failed
        ? `El equipo rechazó el comando ${failed.command} (código ${hex(failed.returnCode)})`
        : 'La emisión terminó sin cerrar el documento';
    if (failed && failed.command === `${cls.prefix}01`) {
        return { outcome: 'failed', errorMsg: `${reason}. No se abrió el documento.` };
    }
    // Quedó abierto: se cancela para no dejar el equipo trabado.
    return finish(await recover(dllPath, port, klass, before, data.pointOfSale, reason));
}

/**
 * Descarga un reporte a la carpeta reportes-fiscales de la PC de caja. No emite
 * ni imprime: el equipo la registra y se puede repetir (6.7.1). El nombre del
 * archivo lo da el equipo: se limpia antes de usarlo como ruta.
 */
async function runFileReport(dllPath, port, cfg, payload) {
    // No emite nada: no necesita el permiso de emisión en modo fiscal.
    const { fiscal } = await precheck(dllPath, port, cfg, [C.DOC_TYPE.TIQUE], { readOnly: true });
    const refuse = (msg) => Object.assign(new Error(msg), { beforeSend: true });
    if (fiscal.mode !== 'fiscal') throw refuse('Los reportes solo se pueden descargar con el equipo en modo fiscal');

    let spec;
    try {
        spec = C.buildFileReportDownload(payload);
    } catch (e) {
        throw refuse(e.message);
    }
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const temp = path.join(REPORTS_DIR, `descarga-${payload.report}-${Date.now()}.tmp`);
    const res = await bridge(dllPath, port, { ...spec, outFile: temp }, true);
    if (res.setupError) throw new DriverUnavailableError(res.setupError);
    if (!res.opened) return { outcome: 'failed', errorMsg: `No se pudo abrir la comunicación con la impresora fiscal (${hex(res.dllError)})` };
    const dl = res.download || {};
    if (!dl.ok) {
        try { fs.unlinkSync(temp); } catch { /* ignorar */ }
        return { outcome: 'failed', errorMsg: dl.error || 'No se pudo descargar el reporte' };
    }
    const safeName = path.basename(String(dl.fileName || '')).replace(/[^A-Za-z0-9._-]/g, '_');
    const fileName = safeName || `${payload.report}-${payload.from}-${payload.to}.pem`;
    fs.renameSync(temp, path.join(REPORTS_DIR, fileName));
    return {
        outcome: 'confirmed',
        // `number`: tamaño del archivo. Este resultado no es un comprobante.
        result: { documentType: C.FILE_REPORTS[payload.report].name, number: dl.bytes, raw: `reportes-fiscales\\${fileName}` },
    };
}

async function execute(device, operation, payload) {
    const cfg = loadConfig();
    const dllPath = cfg.dllPath || path.join(__dirname, 'epson', 'EpsonFiscalDriver.dll');
    const port = portFor(device, cfg);
    if (operation === 'x_report' || operation === 'z_report') {
        return runReport(dllPath, port, cfg, operation === 'z_report' ? 'z' : 'x');
    }
    if (operation === 'download_report') return runFileReport(dllPath, port, cfg, payload);
    if (operation === 'invoice' || operation === 'credit_note') {
        return runDocument(dllPath, port, cfg, operation, payload);
    }
    throw new DriverUnavailableError(`La operación «${operation}» todavía no está implementada para Epson`);
}

module.exports = {
    brand: 'epson',
    /** Modelos/firmware probados FÍSICAMENTE. */
    validatedModels: ['TM-T900FA Vesta 1.01'],
    execute,
    /** Solo pruebas: simula la DLL. */
    __setBridgeForTests(fn) { bridge = fn || runBridge; },
};
