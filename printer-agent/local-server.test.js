const test = require('node:test');
const assert = require('node:assert');
const { startLocalServer, generateLocalKey, keysMatch, isAllowedOrigin } = require('./local-server');

// POS offline V2 — etapa 4: canal local del agente (node --test local-server.test.js)

const POS = 'https://pos.takeasygo.com';

function boot(overrides = {}) {
    const printed = [];
    const config = { localPort: 0, localKey: 'K7P2-M9XQ', ...overrides.config };
    const printers = { p1: { uid: 'p1', name: 'Cocina' }, p2: { uid: 'p2', name: 'Barra' } };
    const server = startLocalServer({
        config,
        version: '2.6.0',
        findPrinter: (id, name) => printers[id] || Object.values(printers).find((p) => p.name === name) || null,
        listPrinters: () => ['Cocina', 'Barra'],
        print: async (printer, buffer) => {
            printed.push({ printer: printer.name, bytes: buffer.length });
            return overrides.failPrinter === printer.name ? { ok: false, error: 'Sin papel' } : { ok: true };
        },
    });
    return new Promise((resolve) => server.on('listening', () => resolve({ server, printed, base: `http://127.0.0.1:${server.address().port}` })));
}

const job = (id, printerId, name) => ({ id, printerId, printerName: name, payload: Buffer.from([0x1b, 0x40, 0x41]).toString('base64') });

test('código: 8 caracteres legibles y comparación tolerante', () => {
    const k = generateLocalKey();
    assert.match(k, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.ok(keysMatch('k7p2m9xq', 'K7P2-M9XQ'));
    assert.ok(!keysMatch('K7P2-M9XA', 'K7P2-M9XQ'));
    assert.ok(!keysMatch('', ''));
});

test('orígenes: el POS sí, una página cualquiera no', () => {
    assert.ok(isAllowedOrigin(POS));
    assert.ok(isAllowedOrigin('https://staging.takeasygo.com'));
    assert.ok(isAllowedOrigin(undefined));
    assert.ok(!isAllowedOrigin('https://evil.example'));
    assert.ok(!isAllowedOrigin('http://takeasygo.com'));
    assert.ok(isAllowedOrigin('https://otro.local', ['https://otro.local']));
});

test('preflight con permiso de red local y health sin/con código', async () => {
    const { server, base } = await boot();
    try {
        const pre = await fetch(`${base}/print`, { method: 'OPTIONS', headers: { Origin: POS, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' } });
        assert.strictEqual(pre.status, 204);
        assert.strictEqual(pre.headers.get('access-control-allow-private-network'), 'true');
        assert.match(pre.headers.get('access-control-allow-headers'), /X-Local-Key/);

        const bad = await fetch(`${base}/print`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
        assert.strictEqual(bad.status, 403);

        const anon = await (await fetch(`${base}/health`, { headers: { Origin: POS } })).json();
        assert.deepStrictEqual(anon, { ok: true, version: '2.6.0', paired: false });

        const res = await fetch(`${base}/health`, { headers: { Origin: POS, 'X-Local-Key': 'k7p2-m9xq' } });
        assert.strictEqual(res.headers.get('access-control-allow-origin'), POS);
        assert.deepStrictEqual(await res.json(), { ok: true, version: '2.6.0', paired: true, printers: ['Cocina', 'Barra'] });
    } finally {
        server.close();
    }
});

test('imprime, no repite el mismo id y avisa la impresora que falló', async () => {
    const { server, base, printed } = await boot({ failPrinter: 'Barra' });
    try {
        const send = (jobs) => fetch(`${base}/print`, { method: 'POST', headers: { Origin: POS, 'Content-Type': 'application/json', 'X-Local-Key': 'K7P2-M9XQ' }, body: JSON.stringify({ jobs }) }).then((r) => r.json());
        const first = await send([job('op1:p1:kitchen', 'p1', 'Cocina'), job('op1:p2:bar', 'p2', 'Barra'), job('op1:x:kitchen', 'x', 'Fantasma')]);
        assert.deepStrictEqual(first.results.map((r) => [r.id, r.ok]), [['op1:p1:kitchen', true], ['op1:p2:bar', false], ['op1:x:kitchen', false]]);
        assert.match(first.results[1].error, /Sin papel/);
        assert.match(first.results[2].error, /no encontrada/);

        // Reintento del POS: misma respuesta, sin imprimir otra vez.
        const again = await send([job('op1:p1:kitchen', 'p1', 'Cocina')]);
        assert.strictEqual(again.results[0].ok, true);
        assert.deepStrictEqual(printed.map((p) => p.printer), ['Cocina', 'Barra']);
    } finally {
        server.close();
    }
});

test('sin código no imprime', async () => {
    const { server, base, printed } = await boot();
    try {
        const res = await fetch(`${base}/print`, { method: 'POST', headers: { Origin: POS, 'Content-Type': 'application/json', 'X-Local-Key': 'MAL0-MAL0' }, body: JSON.stringify({ jobs: [job('a', 'p1', 'Cocina')] }) });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(printed.length, 0);
    } finally {
        server.close();
    }
});
