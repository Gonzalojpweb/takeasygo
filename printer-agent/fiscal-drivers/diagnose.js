// ============================================================================
// Diagnóstico de la impresora fiscal Epson — no imprime ni emite nada
// ============================================================================
// Uso: DIAGNOSTICO.bat (o `node fiscal-drivers/diagnose.js`).
// Revisa todo lo que necesita el agente para hablar con el equipo y dice qué
// hacer si algo falla. Solo consulta: agente, DLL, driver de Windows y estado
// del equipo. No muestra el CUIT ni datos del comercio.
// ============================================================================

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./epson-commands');

const ROOT = path.join(__dirname, '..');
const DLL = path.join(__dirname, 'epson', 'EpsonFiscalDriver.dll');
const BRIDGE = path.join(__dirname, 'epson-bridge.ps1');

function powershell(script) {
    return execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 30000, windowsHide: true }).trim();
}

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    } catch {
        return null;
    }
}

/** Dispositivos USB de Epson (VID 04B8) vistos por Windows, con su código de problema. */
function usbDevices() {
    const script = "$d = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_04B8' }; "
        + "@($d | ForEach-Object { $p = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_ProblemCode -ErrorAction SilentlyContinue).Data; "
        + "[pscustomobject]@{ name = $_.FriendlyName; status = [string]$_.Status; problem = [int]$p } }) | ConvertTo-Json -Compress -AsArray";
    const safe = script.replace(' -AsArray', '');
    const out = powershell(safe);
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
}

function agentProcesses() {
    const out = powershell(
        "$s = Get-Service -Name 'takeasygo*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }; "
        + "$c = Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'agent\\.js' }; "
        + "\"$(@($s).Count),$(@($c).Count)\""
    );
    const [services, consoles] = out.split(',').map(Number);
    return { services, consoles };
}

function deviceStatus() {
    const file = path.join(os.tmpdir(), `tgo-diag-${process.pid}.json`);
    fs.writeFileSync(file, JSON.stringify({ commands: [`${C.CMD.STATUS}|0000`, `${C.CMD.COUNTERS}|0000|${C.DOC_TYPE.TIQUE}`], stopOnError: false }));
    try {
        const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BRIDGE, '-DllPath', DLL, '-Port', 'usb:usb', '-InputFile', file], { encoding: 'utf8', timeout: 60000, windowsHide: true });
        return JSON.parse(out.trim().split(/\r?\n/).pop());
    } finally {
        try { fs.unlinkSync(file); } catch { /* ignorar */ }
    }
}

/**
 * Convierte lo relevado en hallazgos: { ok, title, fix? }. Función pura para las
 * pruebas: toda la lógica de «qué hacer» está acá.
 */
function findings(facts) {
    const out = [];
    const add = (ok, title, fix) => out.push({ ok, title, fix });

    add(Boolean(facts.config), facts.config ? `Agente configurado (versión ${facts.version})` : 'Falta configurar el agente', 'Ejecutar SETUP.bat.');

    const { services, consoles } = facts.agents;
    if (services + consoles === 0) add(false, 'No hay ningún agente corriendo', 'Iniciar el servicio con INSTALAR_SERVICIO.bat o abrir start.bat.');
    else if (services + consoles > 1) add(false, `Hay ${services + consoles} agentes corriendo a la vez`, 'Dejar uno solo: cerrá las ventanas abiertas y dejá el servicio de Windows. Con dos, los pedidos se reparten al azar.');
    else add(true, 'Un solo agente corriendo');

    add(facts.dll, facts.dll ? 'DLL de Epson instalada' : 'Falta la DLL de Epson', 'Copiar EpsonFiscalDriver.dll (64 bits) a fiscal-drivers\\epson. Viene en el programa oficial de Epson, carpeta examples\\C#-DLL\\example\\target.');

    if (facts.usb.length === 0) {
        add(false, 'Windows no ve ningún equipo Epson por USB', 'Revisar que esté prendido y el cable. Si es la primera vez, instalar el driver USB de Epson (TMUSB).');
    } else {
        const broken = facts.usb.filter((d) => d.problem !== 0 || d.status !== 'OK');
        if (broken.length > 0) {
            const missing = broken.some((d) => d.problem === 32);
            add(false, `El driver USB de Epson tiene un problema (código ${broken[0].problem})`, missing
                ? 'Falta el servicio del driver. Clic derecho en REPARAR_USB_EPSON.bat → Ejecutar como administrador.'
                : 'Ejecutar REPARAR_USB_EPSON.bat como administrador. Si sigue, reinstalar el driver USB de Epson.');
        } else {
            add(true, 'Driver USB de Epson funcionando');
        }
    }

    const device = facts.device;
    if (!device) {
        add(false, 'No se pudo consultar el equipo', 'Revisar los pasos anteriores.');
    } else if (device.setupError) {
        add(false, device.setupError, 'Revisar la DLL (tiene que ser la de 64 bits).');
    } else if (!device.opened) {
        add(false, `El equipo no abre la comunicación (código ${device.dllError})`, 'Revisar cable y encendido, y cerrar cualquier otro programa de Epson abierto.');
    } else {
        const status = (device.results || [])[0];
        const fiscal = C.decodeFiscalStatus(status ? status.fiscalStatus : 0);
        const printer = C.decodePrinterStatus(status ? status.printerStatus : 0);
        add(true, `El equipo responde: modo ${fiscal.mode}`);
        if (fiscal.mode === 'fiscal' && !facts.allowFiscalMode) {
            add(false, 'El equipo está en modo fiscal y el agente no tiene permiso para emitir', 'Solo con autorización del titular: agregar "epson": { "allowFiscalMode": true } a config.json y reiniciar el agente.');
        }
        if (fiscal.documentInProgress !== 0) add(false, 'Hay un documento abierto en el equipo', 'Cerrarlo o cancelarlo desde el equipo antes de emitir.');
        if (printer.offline || printer.error || printer.coverOpen) add(false, 'La impresora está fuera de línea, con error o con la tapa abierta', 'Revisar el papel y la tapa.');
    }
    return out;
}

function gather() {
    const config = readConfig();
    let version = '?';
    try { version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { /* ignorar */ }
    const safely = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
    const dll = fs.existsSync(DLL);
    return {
        config: Boolean(config && config.tenantSlug && !String(config.tenantSlug).startsWith('TU-')),
        version,
        allowFiscalMode: Boolean(config && config.epson && config.epson.allowFiscalMode),
        agents: safely(agentProcesses, { services: 0, consoles: 0 }),
        dll,
        usb: safely(usbDevices, []),
        device: dll ? safely(deviceStatus, null) : null,
    };
}

function main() {
    console.log('\nDIAGNOSTICO DE LA IMPRESORA FISCAL EPSON (no imprime nada)\n');
    const result = findings(gather());
    for (const f of result) {
        console.log(`${f.ok ? '[ OK ]' : '[FALLA]'} ${f.title}`);
        if (!f.ok && f.fix) console.log(`        Qué hacer: ${f.fix}`);
    }
    const bad = result.filter((f) => !f.ok).length;
    console.log(bad === 0 ? '\nTodo en orden: probá «Salida de cajero (X)» desde Facturación en el POS.\n' : `\n${bad} punto(s) para resolver.\n`);
}

if (require.main === module) main();

module.exports = { findings };
