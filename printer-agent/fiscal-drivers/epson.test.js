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
    assert.equal(cmds[3], '0A06|0003|||||||');   // bit 1: sin él el equipo no informa el número
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

test('cerró bien pero sin número (visto con el equipo real): lo toma de los contadores', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(46275)] }),
        (cmds) => ({ opened: true, results: cmds.map((c) => ok(c.split('|')[0])) }),
        () => ({ opened: true, results: [ok('0001'), counters(46276)] }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', PAYLOAD);
    assert.equal(out.outcome, 'confirmed');
    assert.equal(out.result.number, 46276);
});

test('cierre Z: confirmado con el número del equipo', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(46276)] }),
        (cmds) => { assert.deepEqual(cmds, ['0801|0000']); return { opened: true, results: [ok('0801', ['1355'])] }; },
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'z_report', null);
    assert.equal(out.outcome, 'confirmed');
    assert.equal(out.result.number, 1355);
    assert.equal(out.result.documentType, 'CIERRE Z');
});

test('salida de cajero (X) usa la extensión del ejemplo oficial', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(46276)] }),
        (cmds) => { assert.deepEqual(cmds, ['0802|0C01']); return { opened: true, results: [ok('0802', ['29'])] }; },
    ]);
    epson.__setBridgeForTests(b.fn);
    assert.equal((await epson.execute(DEVICE, 'x_report', null)).result.number, 29);
});

test('Z con la jornada cerrada: no se envía', async () => {
    const b = fakeBridge([() => ({ opened: true, results: [ok('0001', [], 0x8000), counters(10)] })]);
    epson.__setBridgeForTests(b.fn);
    await assert.rejects(epson.execute(DEVICE, 'z_report', null), (e) => e.beforeSend === true && /ya está cerrada/.test(e.message));
    assert.equal(b.calls.length, 1);
});

test('corte durante el Z: subió el contador de cierres ⇒ confirmado, sin reenviar', async () => {
    const zCounters = (z) => ok('0830', [String(z), '0', '0', '0', '5', '5', '0']);
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), zCounters(1354)] }),
        Object.assign(new Error('timeout'), { uncertain: true }),
        () => ({ opened: true, results: [ok('0001'), zCounters(1355)] }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'z_report', null);
    assert.equal(out.outcome, 'confirmed');
    assert.equal(out.result.number, 1355);
    assert.equal(b.calls.filter((c) => c[0] === '0801').length, 1);
});

test('corte durante el Z y el equipo no responde: «unknown», avisa no repetir', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(10)] }),
        Object.assign(new Error('timeout'), { uncertain: true }),
        Object.assign(new Error('timeout'), { uncertain: true }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'z_report', null);
    assert.equal(out.outcome, 'unknown');
    assert.match(out.errorMsg, /NO pidas otro/);
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

// ── Tique Factura y notas de crédito ────────────────────────────────────────

const COMPANY = { condition: 'responsable_inscripto', docType: 80, docNumber: '30712345671', name: 'Empresa SA' };

test('Tique Factura: apertura con 12 campos, ítem con montos brutos, cierre con 6 campos', () => {
    const cmds = C.buildDocumentCommands({
        receiver: COMPANY,
        lines: [{ description: 'Pizza', quantity: 1, totalCents: 12100, ivaRate: 21 }],
        payments: [{ method: 'transfer', amountCents: 12100 }],
    }, { kind: 'invoice' });
    assert.equal(cmds[0], '0B01|0000|Empresa SA||No informado|||T|30712345671|I||||');
    assert.equal(cmds[0].split('|').length, 2 + 12);
    assert.equal(cmds[1], '0B02|4000|||||Pizza|10000|1210000|2100|||||1|7|7');
    assert.equal(cmds[2], '0B05|0000||||||23|12100');
    assert.equal(cmds[3], '0B06|0003||||||');
    assert.equal(cmds[3].split('|').length, 2 + 6);
});

test('el descuento va dentro del precio en Tique Factura y la suma da exacto', () => {
    assert.deepEqual(C.prorateDiscount([{ totalCents: 1000 }, { totalCents: 2000 }, { totalCents: 3000 }], 100), [983, 1967, 2950]);
    const cmds = C.buildDocumentCommands({
        receiver: COMPANY,
        lines: [{ description: 'A', quantity: 1, totalCents: 10000, ivaRate: 21 }],
        discountCents: 1000,
    }, { kind: 'invoice' });
    assert.ok(!cmds.some((c) => c.startsWith('0B04')));
    assert.ok(cmds[1].includes('|900000|'));
});

test('consumidor final con DNI: Tique Factura con responsabilidad F', () => {
    const cmds = C.buildDocumentCommands({
        receiver: { condition: 'consumidor_final', docType: 96, docNumber: '30111222', name: '' },
        lines: [{ description: 'A', quantity: 1, totalCents: 100, ivaRate: 21 }],
    }, { kind: 'invoice' });
    assert.equal(cmds[0], '0B01|0000|Documento 30111222|||||D|30111222|F||||');
});

test('NC de un tique: 0A con bit 14 y el origen como descripción', () => {
    const cmds = C.buildDocumentCommands({
        receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0' },
        lines: [{ description: 'Pizza', quantity: 1, totalCents: 10000, ivaRate: 21 }],
        origin: { documentType: 'TIQUE', pointOfSale: 4, number: 46279 },
    }, { kind: 'credit_note' });
    assert.equal(cmds[0], '0A01|4000');
    assert.ok(cmds[1].startsWith('0A02|0000|Anula 083-00004-00046279|'));
});

test('NC de una factura: 0D con el comprobante de origen en el campo 12', () => {
    const cmds = C.buildDocumentCommands({
        receiver: COMPANY,
        lines: [{ description: 'Pizza', quantity: 1, totalCents: 12100, ivaRate: 21 }],
        origin: { documentType: 'TIQUE FACTURA A', number: 27 },
    }, { kind: 'credit_note', pointOfSale: 4 });
    assert.equal(cmds[0].split('|')[13], '081-00004-00000027');
    assert.equal(cmds[0].split('|').length, 2 + 12);
    assert.equal(cmds[cmds.length - 1].split('|').length, 2 + 7);
});

test('Tique Factura: el equipo decide la letra y queda en el resultado', async () => {
    const countersLetter = (a, b, c) => [a, b, c].map((n) => ok('0830', ['1', '0', '0', '0', String(n), String(n), '0']));
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), ok('0507', ['Razon', '20123456786', '4', 'I']), ...countersLetter(10, 20, 30)] }),
        (cmds) => ({ opened: true, results: cmds.map((c) => (c.startsWith('0B06') ? ok('0B06', ['11', 'A', '12100', '2100', '0']) : ok(c.split('|')[0]))) }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', { ...PAYLOAD, receiver: COMPANY, totalCents: 12100 });
    assert.equal(out.outcome, 'confirmed');
    assert.deepEqual([out.result.documentType, out.result.number, out.result.pointOfSale, out.result.totalCents], ['TIQUE FACTURA A', 11, 4, 12100]);
    assert.equal(out.errorMsg, null);
});

test('la condición de IVA la manda el equipo, no la configuración del panel', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), ok('0507', ['Razon', '20123456786', '4', 'M']), counters(10)] }),
        (cmds) => {
            assert.equal(cmds[1].split('|')[9], '0');   // tasa 0: emisor no inscripto
            return { opened: true, results: cmds.map((c) => (c.startsWith('0A06') ? ok('0A06', ['11', '10000', '0', '0']) : ok(c.split('|')[0]))) };
        },
    ]);
    epson.__setBridgeForTests(b.fn);
    assert.equal((await epson.execute(DEVICE, 'invoice', { ...PAYLOAD, issuerIvaCondition: 'responsable_inscripto' })).outcome, 'confirmed');
});

test('un total distinto del de la venta se avisa, sin invalidar lo ya emitido', async () => {
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), counters(10)] }),
        (cmds) => ({ opened: true, results: cmds.map((c) => (c.startsWith('0A06') ? ok('0A06', ['11', '9000', '0', '0']) : ok(c.split('|')[0]))) }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', { ...PAYLOAD, totalCents: 10000 });
    assert.equal(out.outcome, 'confirmed');
    assert.match(out.errorMsg, /no coincide/);
});

test('corte en una NC de factura: mira los contadores de las tres letras', async () => {
    const row = (n) => ok('0830', ['1', '0', '0', '0', String(n), String(n), '0']);
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), row(1), row(2), row(3)] }),
        Object.assign(new Error('timeout'), { uncertain: true }),
        () => ({ opened: true, results: [ok('0001'), row(1), row(3), row(3)] }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'credit_note', { ...PAYLOAD, receiver: COMPANY });
    assert.equal(out.outcome, 'confirmed');
    assert.deepEqual([out.result.documentType, out.result.number], ['TIQUE NOTA DE CREDITO B', 3]);
});

test('el equipo rechaza un ítem de un Tique Factura: cancela con 0B 07', async () => {
    const row = ok('0830', ['1', '0', '0', '0', '5', '5', '0']);
    const b = fakeBridge([
        () => ({ opened: true, results: [ok('0001'), row, row, row] }),
        () => ({ opened: true, results: [ok('0B01'), { command: '0B02', dllError: 0, returnCode: 0x0208, fiscalStatus: 0x8082, printerStatus: 0, fields: [] }] }),
        () => ({ opened: true, results: [ok('0001', [], 0x8082), row, row, row] }),
        () => ({ opened: true, results: [ok('0B07', ['6'])] }),
    ]);
    epson.__setBridgeForTests(b.fn);
    const out = await epson.execute(DEVICE, 'invoice', { ...PAYLOAD, receiver: COMPANY });
    assert.equal(out.outcome, 'failed');
    assert.deepEqual(b.calls[3], ['0B07']);
    epson.__setBridgeForTests(null);
});
