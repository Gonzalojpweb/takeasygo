// Pruebas del driver Epson SIN equipo: `node --test fiscal-drivers/`
// Simulan las respuestas de la DLL (epson-bridge.ps1). La prueba física con la
// TM-T900FA en modo entrenamiento es aparte (ver la guía del lunes).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./epson-commands');
const epson = require('./epson');

// ── Armado de comandos (formato del manual Vesta y de cmd_templates) ────────

test('ítem con el formato del ejemplo oficial: 15 campos, cantidad 5,4, precio 7,4, IVA 2,2', () => {
    const cmds = C.buildTicketCommands({
        lines: [{ description: 'Pizza muzza', quantity: 1, totalCents: 10000, ivaRate: 21 }],
        payments: [{ method: 'cash', amountCents: 10000 }],
        issuerIvaCondition: 'responsable_inscripto',
    });
    assert.equal(cmds[0], '0A01|0000');
    assert.equal(cmds[1], '0A02|0000|||||Pizza muzza|10000|1000000|2100|||||1|7|7');
    assert.equal(cmds[1].split('|').length, 2 + 15);
    assert.equal(cmds[2], '0A05|0000||||||08|10000');   // 5 campos antes del código, como el ejemplo oficial
    assert.equal(cmds[3], '0A06|0001|||||||');
});

test('cantidad × precio da exacto el total del ítem (precio con 4 decimales)', () => {
    const [, item] = C.buildTicketCommands({ lines: [{ description: 'Empanada', quantity: 3, totalCents: 1000, ivaRate: 10.5 }] });
    const f = item.split('|');
    assert.equal(f[7], '30000');      // 3,0000
    assert.equal(f[8], '33333');      // 3,3333 → 3 × 3,3333 = 9,9999 ≈ 10,00
    assert.equal(f[9], '1050');       // 10,5 %
});

test('emisor monotributista: IVA 0 y condición 0 (no corresponde)', () => {
    const [, item] = C.buildTicketCommands({ lines: [{ description: 'Café', quantity: 1, totalCents: 2500, ivaRate: 21 }], issuerIvaCondition: 'monotributo' });
    const f = item.split('|');
    assert.equal(f[9], '0');
    assert.equal(f[16], '0');
});

test('descuento global sin tasa de IVA; pagos con su código; texto sin «|» ni acentos', () => {
    const cmds = C.buildTicketCommands({
        lines: [{ description: 'Ñoquis | promo', quantity: 2, totalCents: 20000, ivaRate: 21 }],
        discountCents: 1500,
        payments: [{ method: 'posnet_debit', amountCents: 10000 }, { method: 'mercadopago', amountCents: 8500 }],
    });
    assert.ok(cmds[1].includes('|Noquis   promo|'));
    assert.equal(cmds[2], '0A04|0000|Descuento|1500||DTO|');
    assert.equal(cmds[3], '0A05|0000||||||21|10000');
    assert.equal(cmds[4], '0A05|0000||||Mercado Pago||99|8500');
});

test('estado fiscal: modo entrenamiento/fiscal y documento abierto (tabla 7-1)', () => {
    assert.equal(C.decodeFiscalStatus(0x8000).mode, 'entrenamiento');
    assert.equal(C.decodeFiscalStatus(0xc000).mode, 'fiscal');
    const s = C.decodeFiscalStatus(0x8081);
    assert.equal(s.dayOpen, true);
    assert.equal(s.documentInProgress, 1);
    assert.equal(C.decodePrinterStatus(0x8000).offline, true);
});

// ── Flujo del driver con la DLL simulada ────────────────────────────────────

const PAYLOAD = {
    receiver: { condition: 'consumidor_final', docType: 99 },
    lines: [{ description: 'Pizza', quantity: 1, totalCents: 10000, ivaRate: 21 }],
    payments: [{ method: 'cash', amountCents: 10000 }],
};
const DEVICE = { brand: 'epson', connection: 'usb' };
const ok = (command, fields = [], fiscalStatus = 0x8080) => ({ command, dllError: 0, returnCode: 0, fiscalStatus, printerStatus: 0, fields });
const counters = (last) => ok('0830', ['1', '0', '0', '0', String(last + 1), String(last), '0']);

function fakeBridge(script) {
    const calls = [];
    return {
        calls,
        fn: async (_dll, _port, commands) => {
            calls.push(commands.map((c) => c.split('|')[0]));
            const next = script.shift();
            if (next instanceof Error) throw next;
            return next(commands);
        },
    };
}

test('emisión correcta en modo entrenamiento: confirmado con el número que da el equipo', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(41)] }),
        (cmds) => ({ opened: true, results: cmds.map((c) => (c.startsWith('0A06') ? ok('0A06', ['42', '10000', '1736', '0']) : ok(c.split('|')[0]))) }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', PAYLOAD);
    assert.equal(out.outcome, 'confirmed');
    assert.equal(out.result.number, 42);
    assert.equal(out.result.totalCents, 10000);
});

test('equipo en MODO FISCAL sin habilitar: no se envía nada', async () => {
    const b = fakeBridge([() => ({ opened: true, results: [ok('0001', [], 0xc080), counters(10)] })]);
    epson.__setBridgeForTests(b.fn);
    await assert.rejects(epson.execute(DEVICE, 'invoice', PAYLOAD), (e) => e.beforeSend === true && /MODO FISCAL/.test(e.message));
    assert.equal(b.calls.length, 1);   // solo el control previo
});

test('documento ya abierto en el equipo: no se emite', async () => {
    const b = fakeBridge([() => ({ opened: true, results: [ok('0001', [], 0x8081), counters(10)] })]);
    epson.__setBridgeForTests(b.fn);
    await assert.rejects(epson.execute(DEVICE, 'invoice', PAYLOAD), (e) => e.beforeSend === true && /documento abierto/.test(e.message));
});

test('el equipo rechaza un ítem después de abrir: se cancela el tique (0A 07) y queda «failed»', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(41)] }),
        () => ({ opened: true, results: [ok('0A01'), { command: '0A02', dllError: 0, returnCode: 0x0208, fiscalStatus: 0x8081, printerStatus: 0, fields: [] }] }),
        () => ({ opened: true, results: [ok('0001', [], 0x8081), counters(41)] }),
        () => ({ opened: true, results: [ok('0A07', ['42'])] }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', PAYLOAD);
    assert.equal(out.outcome, 'failed');
    assert.match(out.errorMsg, /0x0208/);
    assert.deepEqual(b.calls[3], ['0A07']);
});

test('corte de comunicación y el contador subió: el tique salió (confirmado, sin reemitir)', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(41)] }),
        Object.assign(new Error('El equipo no respondió a tiempo'), { uncertain: true }),
        () => ({ opened: true, results: [ok('0001'), counters(42)] }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', PAYLOAD);
    assert.equal(out.outcome, 'confirmed');
    assert.equal(out.result.number, 42);
    assert.equal(b.calls.length, 3);   // nunca se volvió a mandar el tique
});

test('corte de comunicación y el equipo no responde después: «unknown»', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(41)] }),
        Object.assign(new Error('timeout'), { uncertain: true }),
        Object.assign(new Error('timeout'), { uncertain: true }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', PAYLOAD);
    assert.equal(out.outcome, 'unknown');
});

test('cliente con CUIT (Tique Factura A/B): todavía no, y no se toca el equipo', async () => {
    const b = fakeBridge([]);
    epson.__setBridgeForTests(b.fn);
    await assert.rejects(
        epson.execute(DEVICE, 'invoice', { ...PAYLOAD, receiver: { condition: 'responsable_inscripto', docType: 80 } }),
        (e) => e.name === 'DriverUnavailableError'
    );
    assert.equal(b.calls.length, 0);
    epson.__setBridgeForTests(null);
});
