// ============================================================================
// IMPRESIÓN SIN INTERNET — canal local del agente (POS offline V2, etapa 4)
// ============================================================================
// Con internet el agente busca los trabajos en el server (poll). Sin internet
// el POS no puede llegar al server, así que le manda la comanda DIRECTO al
// agente por la red del local:
//
//   GET  http://<pc-del-agente>:7717/health   ¿está vivo? ¿el código coincide?
//   POST http://<pc-del-agente>:7717/print    { jobs: [{ id, printerName, printerId, payload(base64) }] }
//
// Seguridad:
//   · Código de vinculación (config.localKey, ej. K7P2-M9XQ) en el header
//     X-Local-Key. Se genera solo la primera vez y se muestra al arrancar.
//   · Solo orígenes del POS (https://pos.takeasygo.com y *.takeasygo.com;
//     localhost para desarrollo; más con config.localAllowedOrigins).
//   · Demasiados códigos errados desde una IP → se bloquea 10 minutos.
//   · Cada trabajo se imprime UNA vez por id (un reintento del POS no repite).
//
// No toca el flujo de la impresora fiscal (Epson): solo trabajos ESC/POS.
// ============================================================================

const http = require('http');
const crypto = require('crypto');
const os = require('os');

const DEFAULT_PORT = 7717;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_JOBS = 20;
const PRINT_TIMEOUT_MS = 18000;
const RESULT_TTL_MS = 60 * 60 * 1000;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 20;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DEFAULT_ORIGINS = ['https://pos.takeasygo.com', 'http://localhost:5173', 'http://127.0.0.1:5173'];

function generateLocalKey() {
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
    return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function normalizeKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function keysMatch(given, expected) {
    const a = Buffer.from(normalizeKey(given));
    const b = Buffer.from(normalizeKey(expected));
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function isAllowedOrigin(origin, extra) {
    if (!origin) return true; // pedido sin navegador (curl, prueba local)
    if (DEFAULT_ORIGINS.includes(origin) || (extra || []).includes(origin)) return true;
    try {
        const u = new URL(origin);
        return u.protocol === 'https:' && (u.hostname === 'takeasygo.com' || u.hostname.endsWith('.takeasygo.com'));
    } catch {
        return false;
    }
}

/** IPs IPv4 de esta PC en la red local (para mostrarlas al arrancar). */
function localAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list || []) {
            if (a.family === 'IPv4' && !a.internal) out.push(a.address);
        }
    }
    return out;
}

/**
 * @param {object} deps
 * @param {object} deps.config            config del agente (localPort, localKey, localAllowedOrigins)
 * @param {string} deps.version
 * @param {(printerId: string, printerName: string) => object|null} deps.findPrinter
 * @param {(printer: object, buffer: Buffer) => Promise<{ok: boolean, error?: string}>} deps.print
 * @param {() => string[]} deps.listPrinters
 */
function startLocalServer(deps) {
    const { config, version } = deps;
    const port = Number.isInteger(Number(config.localPort)) && config.localPort !== '' && config.localPort != null ? Number(config.localPort) : DEFAULT_PORT;
    const results = new Map(); // id → { at, promise }
    const fails = new Map(); // ip → [timestamps]

    function remember(id, promise) {
        const now = Date.now();
        for (const [k, v] of results) if (now - v.at > RESULT_TTL_MS) results.delete(k);
        results.set(id, { at: now, promise });
    }

    function blocked(ip) {
        const now = Date.now();
        const list = (fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
        fails.set(ip, list);
        return list.length >= MAX_FAILS;
    }

    function fail(ip) {
        const list = fails.get(ip) || [];
        list.push(Date.now());
        fails.set(ip, list);
    }

    function send(res, status, body, origin) {
        const headers = {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            Vary: 'Origin',
        };
        if (origin) headers['Access-Control-Allow-Origin'] = origin;
        res.writeHead(status, headers);
        res.end(JSON.stringify(body));
    }

    function printOne(job) {
        const existing = results.get(job.id);
        if (existing) return existing.promise;
        const printer = deps.findPrinter(job.printerId, job.printerName);
        let promise;
        if (!printer) {
            promise = Promise.resolve({ ok: false, error: `Impresora "${job.printerName}" no encontrada en el agente` });
        } else {
            const buffer = Buffer.from(String(job.payload || ''), 'base64');
            if (buffer.length === 0) {
                promise = Promise.resolve({ ok: false, error: 'Trabajo vacío' });
            } else {
                const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'La impresora no respondió a tiempo' }), PRINT_TIMEOUT_MS));
                promise = Promise.race([deps.print(printer, buffer), timeout]);
            }
        }
        remember(job.id, promise);
        return promise;
    }

    const server = http.createServer((req, res) => {
        const origin = req.headers.origin;
        const ip = req.socket.remoteAddress || '?';
        const allowed = isAllowedOrigin(origin, config.localAllowedOrigins);
        const corsOrigin = origin && allowed ? origin : null;

        if (req.method === 'OPTIONS') {
            if (!allowed) {
                res.writeHead(403);
                return res.end();
            }
            res.writeHead(204, {
                'Access-Control-Allow-Origin': origin || '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Local-Key',
                // Chrome/Edge: una página https puede hablar con la red local.
                'Access-Control-Allow-Private-Network': 'true',
                'Access-Control-Max-Age': '600',
                Vary: 'Origin',
            });
            return res.end();
        }

        if (!allowed) return send(res, 403, { error: 'Origen no permitido' }, null);

        const url = new URL(req.url || '/', 'http://local');
        const paired = keysMatch(req.headers['x-local-key'], config.localKey);

        if (req.method === 'GET' && url.pathname === '/health') {
            if (!paired && req.headers['x-local-key']) {
                if (blocked(ip)) return send(res, 429, { error: 'Demasiados intentos' }, corsOrigin);
                fail(ip);
            }
            return send(res, 200, {
                ok: true,
                version,
                paired,
                ...(paired ? { printers: deps.listPrinters() } : {}),
            }, corsOrigin);
        }

        if (req.method === 'POST' && url.pathname === '/print') {
            if (blocked(ip)) return send(res, 429, { error: 'Demasiados intentos' }, corsOrigin);
            if (!paired) {
                fail(ip);
                return send(res, 401, { error: 'Código de vinculación incorrecto' }, corsOrigin);
            }
            let size = 0;
            const chunks = [];
            let aborted = false;
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    aborted = true;
                    send(res, 413, { error: 'Trabajo demasiado grande' }, corsOrigin);
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', async () => {
                if (aborted) return;
                let body;
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                } catch {
                    return send(res, 400, { error: 'JSON inválido' }, corsOrigin);
                }
                const jobs = Array.isArray(body && body.jobs) ? body.jobs.slice(0, MAX_JOBS) : [];
                const valid = jobs.filter((j) => j && typeof j.id === 'string' && j.id.length <= 200 && typeof j.payload === 'string');
                console.log(`[LOCAL] ${valid.length} trabajo(s) del POS sin internet`);
                const out = await Promise.all(valid.map(async (j) => {
                    const r = await printOne(j);
                    if (!r.ok) console.error(`[LOCAL] ${j.printerName}: ${r.error}`);
                    return { id: j.id, ok: r.ok, error: r.ok ? null : r.error };
                }));
                send(res, 200, { results: out }, corsOrigin);
            });
            return;
        }

        send(res, 404, { error: 'No encontrado' }, corsOrigin);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') console.error(`[LOCAL] El puerto ${port} está ocupado: la impresión sin internet no está disponible (¿hay otro agente abierto?)`);
        else console.error(`[LOCAL] ${err.message}`);
    });

    server.listen(port, '0.0.0.0', () => {
        const ips = localAddresses();
        const bound = server.address().port;
        console.log('------------------------------------------');
        console.log('IMPRESION SIN INTERNET (POS)');
        console.log(`  En esta PC:      http://127.0.0.1:${bound}`);
        for (const ipAddr of ips) console.log(`  Desde otra PC:   http://${ipAddr}:${bound}`);
        console.log(`  Codigo:          ${config.localKey}`);
        console.log('  (POS > Configuracion > Sin internet > Impresion sin internet)');
        console.log('------------------------------------------');
    });

    return server;
}

module.exports = { startLocalServer, generateLocalKey, keysMatch, isAllowedOrigin, normalizeKey, DEFAULT_PORT };
