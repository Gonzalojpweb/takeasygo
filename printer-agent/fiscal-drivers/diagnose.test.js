const test = require('node:test');
const assert = require('node:assert');
const { findings } = require('./diagnose');

const healthy = {
    config: true,
    version: '2.5.0',
    allowFiscalMode: true,
    agents: { services: 1, consoles: 0 },
    dll: true,
    usb: [{ name: 'EPSON', status: 'OK', problem: 0 }],
    device: { opened: true, results: [{ fiscalStatus: 0xc000, printerStatus: 0 }] },
};
const failures = (facts) => findings({ ...healthy, ...facts }).filter((f) => !f.ok);

test('con todo bien no marca fallas', () => {
    assert.deepEqual(failures({}), []);
});

test('el caso del 05/11: falta el servicio del driver (código 32) indica la reparación', () => {
    const [f] = failures({ usb: [{ name: 'EPSON', status: 'Error', problem: 32 }], device: { opened: false, dllError: 4 } });
    assert.match(f.fix, /REPARAR_USB_EPSON/);
});

test('dos agentes a la vez es una falla', () => {
    const [f] = failures({ agents: { services: 1, consoles: 1 } });
    assert.match(f.title, /2 agentes/);
});

test('sin agente corriendo también', () => {
    assert.match(failures({ agents: { services: 0, consoles: 0 } })[0].title, /ningún agente/);
});

test('modo fiscal sin permiso lo avisa; en entrenamiento no hace falta', () => {
    assert.match(failures({ allowFiscalMode: false })[0].title, /modo fiscal/);
    assert.deepEqual(failures({ allowFiscalMode: false, device: { opened: true, results: [{ fiscalStatus: 0x8000, printerStatus: 0 }] } }), []);
});

test('sin DLL indica de dónde sacarla', () => {
    assert.match(failures({ dll: false, device: null })[0].fix, /EpsonFiscalDriver\.dll/);
});

test('Windows no ve el equipo', () => {
    assert.match(failures({ usb: [] })[0].title, /no ve ningún equipo/);
});
