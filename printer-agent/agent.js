const axios = require('axios');
const net = require('node:net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execSync, spawn } = require('child_process');
const iconv = require('iconv-lite');

// ============================================================================
// VERSIÓN LOCAL
// ============================================================================
let LOCAL_VERSION = '0.0.0';
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    LOCAL_VERSION = pkg.version || '0.0.0';
} catch (e) {
    console.error('[UPDATE] No se pudo leer package.json, usando versión 0.0.0');
}

function isWindows() {
    return process.platform === 'win32';
}

// ============================================================================
// CONFIGURACIÓN
// ============================================================================
const CONFIG_PATH = path.join(__dirname, 'config.json');
const SERVICE_NAME = 'Takeasygo Printer Agent';

let config = {
    apiUrl: null,
    tenantSlug: null,
    locationId: null,
    pollInterval: 15000,
    autoUpdate: false
};

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        config = { ...config, ...savedConfig };
    } catch (e) {
        console.error('Error leyendo config.json, usando valores por defecto');
    }
} else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('Creado config.json por defecto.');
}

if (!config.apiUrl || !config.tenantSlug || !config.locationId ||
    config.tenantSlug.startsWith('TU-') || config.locationId.startsWith('TU-')) {
    console.log('');
    console.log('Configuracion no completada.');
    console.log('    Ejecuta SETUP.bat para configurar el agente.');
    console.log('');
    process.exit(1);
}

// ============================================================================
// AUTO-UPDATE
// ============================================================================
function isPkg() {
    return typeof process.pkg !== 'undefined';
}

async function checkForUpdate() {
    if (!config.autoUpdate) {
        return;
    }
    try {
        const url = `${config.apiUrl}/api/agent/version`;
        const response = await axios.get(url, { timeout: 5000 });
        const { version: remoteVersion, downloadUrl } = response.data;

        console.log(`[UPDATE] Local: ${LOCAL_VERSION} | Remota: ${remoteVersion}`);

        if (!remoteVersion || remoteVersion === LOCAL_VERSION) {
            return;
        }

        console.log(`[UPDATE] Nueva versión ${remoteVersion}. Descargando...`);
        await performUpdate(downloadUrl);
    } catch (error) {
        console.error(`[UPDATE] No se pudo verificar versión: ${error.message}`);
    }
}

async function performUpdate(downloadUrl) {
    const tempDir = os.tmpdir();
    const ext = isWindows() ? '.exe' : '';
    const tempFile = path.join(tempDir, `printer-agent-update${ext}`);

    try {
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 120000,
        });

        const writer = fs.createWriteStream(tempFile);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const stats = fs.statSync(tempFile);
        if (stats.size < 10000) {
            console.error('[UPDATE] Archivo demasiado pequeño, abortando.');
            fs.unlinkSync(tempFile);
            return;
        }

        console.log(`[UPDATE] Descargado: ${tempFile} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

        if (isWindows()) {
            applyUpdateWindows(tempFile);
        } else {
            applyUpdateLinux(tempFile);
        }
    } catch (error) {
        console.error(`[UPDATE] Error descargando: ${error.message}`);
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        }
    }
}

function applyUpdateWindows(tempFile) {
    const script = path.join(os.tmpdir(), 'takeasygo-update.bat');
    const currentExe = isPkg() ? process.execPath : process.argv[1];

    const content = `@echo off
echo ===================================================
echo    ACTUALIZANDO AGENTE DE IMPRESION - TAKEASYGO
echo ===================================================
echo.
echo Esperando a que el agente se detenga...
timeout /t 3 /nobreak >nul
echo.
echo Deteniendo servicio...
net stop "${SERVICE_NAME}" >nul 2>&1
timeout /t 2 /nobreak >nul
echo.
echo Reemplazando archivos...
copy /Y "${tempFile}" "${currentExe}" >nul
echo.
echo Iniciando servicio...
net start "${SERVICE_NAME}"
echo.
echo ===================================================
echo    ACTUALIZACION COMPLETADA
echo ===================================================
del "%~f0"
`;

    fs.writeFileSync(script, content, 'utf8');
    console.log('[UPDATE] Lanzando script de actualización...');

    spawn('cmd.exe', ['/c', script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    }).unref();

    process.exit(0);
}

function applyUpdateLinux(tempFile) {
    const script = path.join(os.tmpdir(), 'takeasygo-update.sh');
    const currentExe = process.execPath;

    const content = `#!/bin/bash
echo "=================================================="
echo "   ACTUALIZANDO AGENTE DE IMPRESION - TAKEASYGO"
echo "=================================================="
sleep 3

if command -v pm2 &> /dev/null; then
    pm2 stop printer-agent 2>/dev/null || true
    sleep 2
    cp -f "${tempFile}" "${currentExe}"
    chmod +x "${currentExe}"
    pm2 start printer-agent || pm2 resurrect
elif systemctl is-active --quiet printer-agent 2>/dev/null; then
    sudo systemctl stop printer-agent
    sleep 2
    cp -f "${tempFile}" "${currentExe}"
    chmod +x "${currentExe}"
    sudo systemctl start printer-agent
else
    cp -f "${tempFile}" "${currentExe}"
    chmod +x "${currentExe}"
    nohup "${currentExe}" > /dev/null 2>&1 &
fi

echo "ACTUALIZACION COMPLETADA"
rm -f "${script}"
`;

    fs.writeFileSync(script, content, 'utf8');
    fs.chmodSync(script, '755');

    spawn('bash', [script], {
        detached: true,
        stdio: 'ignore',
    }).unref();

    process.exit(0);
}

// ============================================================================
// COMANDOS ESC/POS — CP437 (página 0, default de la mayoría de impresoras)
// ============================================================================
const ESC_POS = {
    INIT: Buffer.from([0x1b, 0x40]),
    CUT: Buffer.from([0x1d, 0x56, 0x01]),
    BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
    BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
    ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
    ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
    ALIGN_RIGHT: Buffer.from([0x1b, 0x61, 0x02]),
    TEXT_SIZE_NORMAL: Buffer.from([0x1d, 0x21, 0x00]),
    TEXT_SIZE_LARGE: Buffer.from([0x1d, 0x21, 0x11]),
    TEXT_SIZE_DOUBLE_HEIGHT: Buffer.from([0x1d, 0x21, 0x01]),
    TEXT_SIZE_DOUBLE_WIDTH: Buffer.from([0x1d, 0x21, 0x10]),
    TEXT_SIZE_DOUBLE_BOTH: Buffer.from([0x1d, 0x21, 0x11]),
    TEXT_SIZE_TRIPLE_HEIGHT: Buffer.from([0x1d, 0x21, 0x02]),
    TEXT_SIZE_TRIPLE_WIDTH: Buffer.from([0x1d, 0x21, 0x20]),
    TEXT_SIZE_TRIPLE_BOTH: Buffer.from([0x1d, 0x21, 0x12]),
    LINE_SPACING: (n) => Buffer.from([0x1b, 0x33, n]),
    CODE_PAGE: Buffer.from([0x1b, 0x74, 0x00]), // CP437 = página 0
};

function getFontSizeCommand(size) {
    switch (size) {
        case 'normal':  return ESC_POS.TEXT_SIZE_NORMAL;
        case 'large':   return ESC_POS.TEXT_SIZE_LARGE;
        case 'double':  return ESC_POS.TEXT_SIZE_DOUBLE_BOTH;
        case 'triple':  return ESC_POS.TEXT_SIZE_TRIPLE_BOTH;
        default:        return ESC_POS.TEXT_SIZE_NORMAL;
    }
}

// CP437: tiene á é í ó ú ü ñ É Ñ pero NO Á Í Ó Ú — esos se normalizan a base
function buf(input) {
    if (Buffer.isBuffer(input)) return input;
    const str = typeof input === 'string' ? input : String(input);
    // Normalizar: NFD separa acentos, quitamos combining marks que CP437 no tiene,
    // pero preservamos los precomposed que sí existen (á é í ó ú ü ñ)
    const cleaned = str
        .replace(/Á/g, 'A').replace(/Í/g, 'I')
        .replace(/Ó/g, 'O').replace(/Ú/g, 'U')
        .replace(/[^\u0000-\u00FF\u0100-\u017F\u20AC\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/g, '');
    return iconv.encode(cleaned, 'cp437');
}

// ============================================================================
// REGISTRO UNIFICADO DE IMPRESORAS
// ============================================================================
// Dos fuentes:
//   1. serverPrinters — configuración desde la API (ambos formatos)
//   2. windowsPrinters — detección local vía Get-Printer
//
// findPrinterByName resuelve contra ambas, con normalización de nombre.
let serverPrinters = [];
let windowsPrinters = [];

function isWindowsOS() {
    return process.platform === 'win32';
}

function inferConnectionType(portName) {
    const port = (portName || '').toUpperCase();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(port) || port.startsWith('IP_')) return 'tcp';
    if (port.includes('USB')) return 'usb';
    if (port.startsWith('LPT') || port.startsWith('COM')) return 'usb';
    return 'usb';
}

function refreshWindowsPrinters() {
    if (!isWindowsOS()) return;
    try {
        const output = execSync(
            'powershell -NoProfile -Command "Get-Printer | Select-Object Name, PortName, DriverName | ConvertTo-Json -Compress"',
            { encoding: 'utf8', timeout: 8000, windowsHide: true }
        );
        if (!output || !output.trim()) {
            windowsPrinters = [];
            return;
        }
        let parsed = JSON.parse(output);
        if (!Array.isArray(parsed)) parsed = [parsed];

        windowsPrinters = parsed
            .filter(p => p && p.Name)
            .map(p => ({
                name: String(p.Name).trim(),
                portName: String(p.PortName || '').trim(),
                driverName: String(p.DriverName || '').trim(),
                connectionType: inferConnectionType(p.PortName),
            }));

        const names = windowsPrinters.map(p => p.name);
        console.log(`[PRINTER] Windows: ${names.length} impresoras — ${names.join(', ')}`);
    } catch (e) {
        console.error(`[PRINTER] Error detectando impresoras Windows: ${e.message}`);
        // No limpiar windowsPrinters en error — conservar la última detección buena
    }
}

function findPrinterByName(name) {
    if (!name) return null;
    const target = String(name).trim().toLowerCase();

    // 1. Configuración del servidor (autoritativa: tiene connectionType, ip, port, paperWidth)
    let found = serverPrinters.find(p => p.name && String(p.name).trim().toLowerCase() === target);
    if (found) {
        return {
            uid: found.uid || found._id || found.name,
            name: found.name,
            connectionType: found.connectionType || 'tcp',
            ip: found.ip || '',
            port: found.port || 9100,
            paperWidth: found.paperWidth || 80,
            roles: found.roles || [],
            printSettings: found.printSettings || null,
            source: 'server',
        };
    }

    // 2. Impresora local de Windows (no virtual) → asumir USB
    const winPrinter = windowsPrinters.find(p => p.name.toLowerCase() === target);
    if (winPrinter && winPrinter.connectionType !== 'virtual') {
        return {
            uid: winPrinter.name,
            name: winPrinter.name,
            connectionType: winPrinter.connectionType,
            ip: '',
            port: 0,
            paperWidth: 80,
            roles: [],
            printSettings: null,
            source: 'windows',
        };
    }

    return null;
}

// ============================================================================
// ENVÍO TCP (RAW por socket)
// ============================================================================
function classifyTcpError(err) {
    const code = err.code || '';
    if (code === 'ECONNREFUSED') return 'Impresora offline: conexión rechazada (¿apagada o puerto incorrecto?)';
    if (code === 'EHOSTUNREACH') return 'Error de red: host inaccesible';
    if (code === 'ENETUNREACH') return 'Error de red: red inaccesible';
    if (code === 'ENOTFOUND') return 'Error de red: IP no encontrada';
    if (code === 'ETIMEDOUT' || err.message.includes('TIMEOUT')) return 'Timeout: la impresora no respondió';
    if (code === 'EPIPE' || code === 'ECONNRESET') return 'Conexión interrumpida por la impresora';
    return `Error TCP: ${err.message}`;
}

async function sendToPrinter(ip, port, dataBuffer) {
    return new Promise((resolve, reject) => {
        if (!ip) {
            return reject(new Error('Error de configuración: impresora TCP sin IP'));
        }
        if (!port || port === 0) {
            return reject(new Error('Error de configuración: impresora TCP sin puerto'));
        }

        const client = new net.Socket();
        client.setTimeout(8000);

        client.on('error', (err) => {
            client.destroy();
            reject(new Error(classifyTcpError(err)));
        });

        client.on('timeout', () => {
            client.destroy();
            reject(new Error('Timeout: la impresora no respondió'));
        });

        client.connect(port, ip, () => {
            console.log(`[TCP] Conectado a ${ip}:${port}, enviando ${dataBuffer.length} bytes...`);
            client.write(dataBuffer, (err) => {
                if (err) return reject(new Error(classifyTcpError(err)));
                client.end(() => {
                    client.destroy();
                    resolve();
                });
            });
        });
    });
}

// ============================================================================
// ENVÍO USB/LOCAL (Win32 Spooler vía PowerShell)
// ============================================================================
function classifySpoolerError(stderr, err) {
    const msg = (stderr || err.message || '').trim();

    if (msg.includes('No se puede enlazar') && msg.includes('PrinterName')) {
        return 'Error de configuración: nombre de impresora vacío';
    }
    if (msg.includes('ERROR_SPOOLER')) {
        const codeMatch = msg.match(/codigo=(-?\d+)/);
        const win32Match = msg.match(/win32=(\d+)/);
        const code = codeMatch ? codeMatch[1] : '?';
        const win32 = win32Match ? win32Match[1] : '?';

        const codeDescriptions = {
            '-1': 'Impresora no encontrada o acceso denegado (OpenPrinter falló)',
            '-2': 'Error al iniciar documento (StartDocPrinter falló)',
            '-3': 'Error al iniciar página (StartPagePrinter falló)',
            '-4': 'Error al enviar datos (WritePrinter falló)',
            '-5': 'Error al finalizar página (EndPagePrinter falló)',
            '-6': 'Error al finalizar documento (EndDocPrinter falló)',
        };
        const desc = codeDescriptions[code] || 'Error desconocido del spooler';
        return `${desc} [spooler=${code} win32=${win32}]`;
    }
    if (msg.includes('ARCHIVO_NO_ENCONTRADO')) {
        return 'Error interno: archivo temporal no encontrado';
    }
    if (msg.includes('ERROR_LECTURA')) {
        return 'Error interno: no se pudo leer el archivo temporal';
    }
    if (msg.includes('not recognized') || msg.includes('no se reconoce')) {
        return 'Error de PowerShell: no se pudo ejecutar send-raw.ps1';
    }

    return msg || err.message || 'Error desconocido al imprimir';
}

async function sendToPrinterUSB(printerName, dataBuffer) {
    if (!printerName || !printerName.trim()) {
        throw new Error('Error de configuración: nombre de impresora USB vacío');
    }

    const tmpFile = path.join(os.tmpdir(), `ticket-${Date.now()}-${process.pid}.bin`);
    fs.writeFileSync(tmpFile, dataBuffer);

    return new Promise((resolve, reject) => {
        const psScript = path.join(__dirname, 'send-raw.ps1');
        if (!fs.existsSync(psScript)) {
            try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
            return reject(new Error(`send-raw.ps1 no encontrado en ${psScript}`));
        }

        execFile(
            'powershell',
            [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-File', psScript,
                '-PrinterName', printerName,
                '-FilePath', tmpFile
            ],
            { timeout: 15000, windowsHide: true },
            (err, stdout, stderr) => {
                // Siempre limpiar archivo temporal
                try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

                if (err) {
                    reject(new Error(classifySpoolerError(stderr, err)));
                } else {
                    resolve(stdout.trim());
                }
            }
        );
    });
}

// ============================================================================
// GESTOR DE COLAS SECUENCIAL
// ============================================================================
// Un queue por impresora. Los jobs se procesan en orden FIFO.
class JobManager {
    constructor() {
        this.queues = new Map();
        this.running = new Map();
    }

    enqueue(printerUid, printerConfig, buffer, onComplete) {
        if (!this.queues.has(printerUid)) {
            this.queues.set(printerUid, []);
            this.running.set(printerUid, false);
        }
        this.queues.get(printerUid).push({ printerConfig, buffer, onComplete });
        if (!this.running.get(printerUid)) {
            this._processQueue(printerUid);
        }
    }

    async _processQueue(printerUid) {
        this.running.set(printerUid, true);
        const queue = this.queues.get(printerUid);
        while (queue.length > 0) {
            const job = queue.shift();
            try {
                console.log(`[JOB] Imprimiendo en ${job.printerConfig.name}...`);

                const isUSB = job.printerConfig.connectionType === 'usb';

                if (isUSB) {
                    console.log(`[USB] Enviando RAW a ${job.printerConfig.name}`);
                    // USB/local: enviar SIEMPRE el nombre de Windows, NUNCA la IP
                    await sendToPrinterUSB(job.printerConfig.name, job.buffer);
                } else {
                    console.log(`[TCP] Enviando a ${job.printerConfig.ip}:${job.printerConfig.port}`);
                    await sendToPrinter(job.printerConfig.ip, job.printerConfig.port, job.buffer);
                }

                console.log(`[OK] Impreso correctamente en ${job.printerConfig.name}`);
                await job.onComplete(true);
            } catch (err) {
                console.error(`[FALLO] ${job.printerConfig.name}: ${err.message}`);
                await job.onComplete(false, err.message);
            }
        }
        this.running.set(printerUid, false);
    }
}

const jobManager = new JobManager();

// ============================================================================
// GENERACIÓN DE TICKETS (solo formato legacy — el nuevo viene pre-renderizado)
// ============================================================================
function printCustomizations(customizations, chunks, indent) {
    if (!customizations || customizations.length === 0) return;
    customizations.forEach(c => {
        const group = c.groupName || '';
        const sels = Array.isArray(c.selectedOptions) && c.selectedOptions.length > 0
            ? c.selectedOptions.map(o => o.name?.toUpperCase()).filter(Boolean)
            : [];
        if (sels.length > 0) {
            const prefix = group ? group.toUpperCase() + ': ' : '';
            chunks.push(buf(`${indent}> ${prefix}${sels.join(', ')}\n`));
        }
        if (Array.isArray(c.selectedOptions)) {
            c.selectedOptions.forEach(opt => {
                if (Array.isArray(opt.subGroups) && opt.subGroups.length > 0) {
                    printCustomizations(opt.subGroups, chunks, indent + '    ');
                }
            });
        }
    });
}

function generateTicket(order, role, columns = 32, printSettings = null) {
    let chunks = [];
    const customer = order.customer || {};
    const allItems = order.items || [];

    const settings = printSettings || {
        fontSize: role === 'cashier' ? 'normal' : 'large',
        lineSpacing: role === 'cashier' ? 36 : 48,
        showDescriptions: role === 'cashier',
        showPrices: role === 'cashier',
        showCategory: true,
        showCustomerInfo: true,
        showOrderNotes: true,
        showTotal: role === 'cashier',
        headerTemplate: '',
        footerTemplate: '',
    };

    let itemsToPrint = [];
    if (role === 'cashier') {
        itemsToPrint = allItems;
    } else if (role === 'kitchen') {
        itemsToPrint = allItems.filter(i => !i.printRole || i.printRole === 'kitchen' || i.printRole === 'both');
    } else if (role === 'bar') {
        itemsToPrint = allItems.filter(i => i.printRole === 'bar' || i.printRole === 'both');
    }

    if (itemsToPrint.length === 0) return null;

    const lineStr = '-'.repeat(columns);
    const money = (v) => (Number(v || 0) / 100).toLocaleString('es-AR');

    chunks.push(ESC_POS.INIT, ESC_POS.CODE_PAGE, ESC_POS.ALIGN_CENTER);
    chunks.push(ESC_POS.LINE_SPACING(settings.lineSpacing));

    if (settings.headerTemplate) {
        chunks.push(buf(`${settings.headerTemplate}\n`));
        chunks.push(buf(`${lineStr}\n`));
    }

    if (role === 'cashier') {
        chunks.push(getFontSizeCommand(settings.fontSize), ESC_POS.BOLD_ON);
        chunks.push(buf(`${(order.location?.locationName?.toUpperCase()) || 'MI NEGOCIO'}\n`));
        chunks.push(ESC_POS.TEXT_SIZE_NORMAL, ESC_POS.BOLD_OFF);
        chunks.push(buf(`TICKET DE PAGO\n`));
    } else {
        chunks.push(getFontSizeCommand(settings.fontSize), ESC_POS.BOLD_ON);
        chunks.push(buf(`ORDEN: ${order.orderNumber}\n`));
        chunks.push(ESC_POS.TEXT_SIZE_NORMAL, ESC_POS.BOLD_OFF);

        let sectorName = "COCINA";
        if (role === 'bar') sectorName = "BARRA / BEBIDAS";

        chunks.push(buf(`*** ${sectorName} ***\n`));
    }

    chunks.push(buf(`${lineStr}\n`));
    chunks.push(ESC_POS.ALIGN_LEFT);
    chunks.push(buf(`Fecha: ${new Date(order.createdAt).toLocaleString('es-AR')}\n`));

    if (order.orderMode) {
        const modeLabel = order.orderMode === 'takeaway' ? 'PARA LLEVAR' : 'DELIVERY';
        chunks.push(buf(`Tipo: ${modeLabel}\n`));
    }

    if (order.payment?.method === 'cash') {
        chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON);
        chunks.push(buf(`=== PAGO EFECTIVO ===\n`));
        chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT);
    }

    if (order.orderMode === 'delivery' && order.deliveryAddress) {
        const addr = order.deliveryAddress;
        chunks.push(ESC_POS.BOLD_ON);
        let addrLine = `Dir: ${addr.street} ${addr.number}`;
        if (addr.apt) addrLine += ` (${addr.apt})`;
        chunks.push(buf(`${addrLine}\n`));
        chunks.push(buf(`${addr.city}\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    if (order.orderTiming === 'scheduled' && order.scheduledPickupAt) {
        const schedDate = new Date(order.scheduledPickupAt);
        const schedTime = schedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const schedDateStr = schedDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`PROGRAMADO: ${schedDateStr} ${schedTime} hs\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    if (settings.showCustomerInfo) {
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`Cliente: ${(customer.name || '').toUpperCase()}\n`));
        if (customer.phone) {
            chunks.push(buf(`Tel: ${customer.phone}\n`));
        }
        chunks.push(ESC_POS.BOLD_OFF);
    }

    if (settings.showOrderNotes && order.notes) {
        chunks.push(buf(`${lineStr}\n`));
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`OBS: ${order.notes}\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    chunks.push(buf(`${lineStr}\n`));

    let lastCategory = null;
    const promoGroups = [];
    let currentGroup = null;

    itemsToPrint.forEach(item => {
        if (item.itemType === 'promotion' && item.promotionTitle) {
            if (currentGroup && currentGroup.promotionTitle === item.promotionTitle) {
                currentGroup.items.push(item);
                currentGroup.totalQuantity += item.quantity;
            } else {
                currentGroup = {
                    promotionTitle: item.promotionTitle,
                    totalQuantity: item.quantity,
                    items: [item],
                };
                promoGroups.push(currentGroup);
            }
        } else {
            currentGroup = null;
            promoGroups.push({ single: item });
        }
    });

    promoGroups.forEach(group => {
        if (group.single) {
            const item = group.single;

            if (item.itemType === 'reward') {
                chunks.push(buf(`[RECOMPENSA]\n`));
            }

            let displayName = item.name.toUpperCase();
            const line = `${item.quantity}x ${displayName}`;

            if (settings.showCategory) {
                const currentCategory = (item.categoryName && item.itemType !== 'reward')
                    ? item.categoryName : null;
                if (currentCategory && currentCategory !== lastCategory) {
                    chunks.push(buf(`[${currentCategory.toUpperCase()}]\n`));
                }
                lastCategory = currentCategory;
            }

            if (settings.showPrices) {
                const price = `$${money(item.price * item.quantity)}`;
                const dots = '.'.repeat(Math.max(2, columns - line.length - price.length));
                chunks.push(buf(`${line}${dots}${price}\n`));
            } else {
                chunks.push(ESC_POS.TEXT_SIZE_DOUBLE_HEIGHT, ESC_POS.BOLD_ON);
                chunks.push(buf(`${line}\n`));
                chunks.push(ESC_POS.BOLD_OFF, getFontSizeCommand(settings.fontSize));
            }

            if (settings.showDescriptions && item.description) {
                const desc = item.description.length > columns
                    ? item.description.substring(0, columns - 3) + '...'
                    : item.description;
                chunks.push(buf(`  ${desc.toUpperCase()}\n`));
            }

            if (item.selectedVariant) {
                chunks.push(buf(`  > Variante: ${item.selectedVariant.name.toUpperCase()}\n`));
            }

            const halfFirst = (item.customizations || []).find(c => /primera mitad/i.test(c.groupName));
            const halfSecond = (item.customizations || []).find(c => /segunda mitad/i.test(c.groupName));

            if (halfFirst || halfSecond) {
                chunks.push(buf('  === MITAD Y MITAD ===\n'));
                if (halfFirst) {
                    const opt = halfFirst.selectedOptions?.[0]?.name || '';
                    chunks.push(buf(`    1ra mitad: ${opt.toUpperCase()}\n`));
                }
                if (halfSecond) {
                    const opt = halfSecond.selectedOptions?.[0]?.name || '';
                    chunks.push(buf(`    2da mitad: ${opt.toUpperCase()}\n`));
                }
                const otherCustomizations = (item.customizations || []).filter(c =>
                    !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
                );
                if (otherCustomizations.length > 0) {
                    printCustomizations(otherCustomizations, chunks, '  ');
                }
            } else {
                printCustomizations(item.customizations, chunks, '  ');
            }
            chunks.push(buf('\n\n'));
        } else {
            const promoTitle = group.promotionTitle.toUpperCase();
            const totalQty = group.totalQuantity;

            if (settings.showCategory) {
                lastCategory = null;
            }

            if (settings.showPrices) {
                const headerLine = `${totalQty}x ${promoTitle}`;
                const headerPrice = `$${money(group.items.reduce((s, i) => s + i.price * i.quantity, 0))}`;
                const dots = '.'.repeat(Math.max(2, columns - headerLine.length - headerPrice.length));
                chunks.push(buf(`${headerLine}${dots}${headerPrice}\n`));
            } else {
                chunks.push(ESC_POS.TEXT_SIZE_DOUBLE_HEIGHT, ESC_POS.BOLD_ON);
                chunks.push(buf(`${totalQty}x ${promoTitle}\n`));
                chunks.push(ESC_POS.BOLD_OFF, getFontSizeCommand(settings.fontSize));
            }

            if (settings.showDescriptions && group.items[0].shortDescription) {
                const short = group.items[0].shortDescription.length > columns
                    ? group.items[0].shortDescription.substring(0, columns - 3) + '...'
                    : group.items[0].shortDescription;
                chunks.push(buf(`  ${short.toUpperCase()}\n`));
            }

            group.items.forEach(item => {
                const rawName = item.name.includes(' - ')
                    ? item.name.substring(item.name.indexOf(' - ') + 3)
                    : item.name;
                const itemName = rawName.toUpperCase();
                const subLine = `  - ${item.quantity}x ${itemName}`;
                chunks.push(buf(`${subLine}\n`));

                if (item.selectedVariant) {
                    chunks.push(buf(`    > Variante: ${item.selectedVariant.name.toUpperCase()}\n`));
                }

                const promoHalfFirst = (item.customizations || []).find(c => /primera mitad/i.test(c.groupName));
                const promoHalfSecond = (item.customizations || []).find(c => /segunda mitad/i.test(c.groupName));

                if (promoHalfFirst || promoHalfSecond) {
                    chunks.push(buf('    === MITAD Y MITAD ===\n'));
                    if (promoHalfFirst) {
                        const opt = promoHalfFirst.selectedOptions?.[0]?.name || '';
                        chunks.push(buf(`      1ra mitad: ${opt.toUpperCase()}\n`));
                    }
                    if (promoHalfSecond) {
                        const opt = promoHalfSecond.selectedOptions?.[0]?.name || '';
                        chunks.push(buf(`      2da mitad: ${opt.toUpperCase()}\n`));
                    }
                    const otherCustomizations = (item.customizations || []).filter(c =>
                        !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
                    );
                    if (otherCustomizations.length > 0) {
                        printCustomizations(otherCustomizations, chunks, '    ');
                    }
                } else {
                    printCustomizations(item.customizations, chunks, '    ');
                }
            });

            chunks.push(buf('\n'));
        }
    });

    if (order.promoCode && order.promoCreatedBy === 'superadmin') {
        chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON);
        chunks.push(buf(`[PROMO SUPERADMIN: ${order.promoCode.toUpperCase()}]\n`));
        chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT);
    } else if (order.discountAmount > 0 && order.promoSlug) {
        chunks.push(ESC_POS.ALIGN_CENTER);
        chunks.push(buf(`[DESCUENTO PROMO: ${order.promoSlug.toUpperCase()}]\n`));
        chunks.push(ESC_POS.ALIGN_LEFT);
    }

    chunks.push(buf(`${lineStr}\n`));
    if (settings.showTotal) {
        chunks.push(ESC_POS.ALIGN_RIGHT, ESC_POS.BOLD_ON);
        chunks.push(buf(`TOTAL: $${money(order.total)}\n`));
    }

    if (settings.footerTemplate) {
        chunks.push(ESC_POS.ALIGN_CENTER);
        chunks.push(buf(`${settings.footerTemplate}\n`));
    }

    chunks.push(buf('\n\n\n\n'), ESC_POS.CUT);
    return Buffer.concat(chunks);
}

// ============================================================================
// PRE-CLOSE JOBS (cierre de turno)
// ============================================================================
function processPreCloseJob(preCloseJob) {
    const printer = findPrinterByName(preCloseJob.printerName);
    if (!printer) {
        console.error(`[ERROR] Impresora "${preCloseJob.printerName}" no encontrada para pre-close ${preCloseJob._id}`);
        // Reportar fallo al servidor
        axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
            preCloseJobId: preCloseJob._id,
            printerName: preCloseJob.printerName,
            success: false,
            errorMsg: `Impresora "${preCloseJob.printerName}" no encontrada`
        }).catch(() => {});
        return;
    }

    console.log(`[QUEUE] PreClose ${preCloseJob._id} → ${printer.name}`);
    const buffer = Buffer.from(preCloseJob.data, 'base64');

    jobManager.enqueue(printer.uid, printer, buffer, async (success, errorMsg) => {
        try {
            await axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
                preCloseJobId: preCloseJob._id,
                printerName: printer.name,
                success,
                errorMsg
            });
            console.log(`[CLOUD] PreClose ${preCloseJob._id} sincronizado`);
        } catch (e) {
            console.error(`[CLOUD ERROR] No se pudo confirmar pre-close: ${e.message}`);
        }
    });
}

// ============================================================================
// REPORTAR FALLO DE JOB AL SERVIDOR
// ============================================================================
async function reportJobFailure(job, errorMsg) {
    try {
        await axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
            orderId: job.orderId,
            printJobId: job.printJobId,
            success: false,
            errorMsg,
        });
        console.log(`[CLOUD] Job ${job.printJobId} marcado como fallido`);
    } catch (e) {
        console.error(`[CLOUD ERROR] No se pudo reportar fallo: ${e.message}`);
    }
}

// ============================================================================
// POLLING ADAPTATIVO
// ============================================================================
const MIN_INTERVAL = 3000;
const MAX_INTERVAL = 45000;
const BACKOFF_FACTOR = 1.6;
let currentInterval = MIN_INTERVAL;
let pollTimer = null;

async function poll() {
    let hadWork = false;
    let pollInterval = currentInterval;

    try {
        const url = `${config.apiUrl}/api/${config.tenantSlug}/print-jobs?locationId=${config.locationId}`;
        const response = await axios.get(url, {
            headers: { 'X-Agent-Version': LOCAL_VERSION }
        });
        const data = response.data;

        // ── Formato NUEVO: jobs pre-renderizados ───────────────────────
        if (data.jobs !== undefined) {
            const jobs = data.jobs || [];
            const preCloseJobs = data.preCloseJobs || [];

            // Actualizar registry de impresoras del servidor (ambos formatos lo envían)
            if (Array.isArray(data.printers)) {
                serverPrinters = data.printers;
            }

            pollInterval = data.pollInterval || currentInterval;
            hadWork = jobs.length > 0 || preCloseJobs.length > 0;

            console.log(`[POLL] jobs=${jobs.length} preClose=${preCloseJobs.length} printers=${serverPrinters.length}`);

            for (const job of jobs) {
                const printer = findPrinterByName(job.printerName);
                if (!printer) {
                    console.error(`[ERROR] Impresora "${job.printerName}" no encontrada (ni servidor ni Windows). Job ${job.printJobId} → reportando fallo.`);
                    await reportJobFailure(job, `Impresora "${job.printerName}" no encontrada en este equipo`);
                    continue;
                }

                console.log(`[QUEUE] Job ${job.printJobId} → ${job.printerName} (${job.role}) [${printer.connectionType}]`);

                jobManager.enqueue(printer.uid, printer, Buffer.from(job.payload, 'base64'), async (success, errorMsg) => {
                    try {
                        await axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
                            orderId: job.orderId,
                            printJobId: job.printJobId,
                            success,
                            errorMsg
                        });
                        console.log(`[CLOUD] Job ${job.printJobId} sincronizado`);
                    } catch (e) {
                        console.error(`[CLOUD ERROR] No se pudo sincronizar job: ${e.message}`);
                    }
                });
            }

            for (const job of preCloseJobs) {
                processPreCloseJob(job);
            }

        // ── Formato VIEJO: orders + printers (fallback) ─────────────────
        } else {
            const { orders, printers, preCloseJobs, pollInterval: serverPollInterval } = data;
            pollInterval = serverPollInterval || currentInterval;

            if (Array.isArray(printers)) {
                serverPrinters = printers;
            }

            const orderCount = (orders || []).length;
            const printerCount = serverPrinters.length;
            const preCloseCount = (preCloseJobs || []).length;
            console.log(`[POLL] (legacy) orders=${orderCount} printers=${printerCount} preClose=${preCloseCount}`);

            hadWork = orderCount > 0 || preCloseCount > 0;

            if (printerCount === 0) {
                console.warn('[WARN] No hay impresoras configuradas para esta sede.');
            }

            if (preCloseJobs && preCloseJobs.length > 0) {
                for (const job of preCloseJobs) {
                    processPreCloseJob(job);
                }
            }

            if (orders && orders.length > 0) {
                for (const order of orders) {
                    for (const printer of serverPrinters) {
                        for (const role of (printer.roles || [])) {
                            console.log(`[QUEUE] Orden ${order.orderNumber} → ${printer.name} (${role})`);

                            let ticketBuffer;
                            try {
                                const settings = printer.printSettings?.[role] || null;
                                ticketBuffer = generateTicket(order, role, printer.paperWidth === 80 ? 48 : 32, settings);
                            } catch (err) {
                                console.error(`[ERROR] generateTicket falló: ${err.message}`);
                                continue;
                            }

                            if (!ticketBuffer) continue;

                            jobManager.enqueue(printer.uid, printer, ticketBuffer, async (success, errorMsg) => {
                                try {
                                    await axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
                                        orderId: order._id,
                                        printerName: printer.name,
                                        role: role,
                                        success,
                                        errorMsg
                                    });
                                } catch (e) {
                                    console.error(`[CLOUD ERROR] ${e.message}`);
                                }
                            });
                        }
                    }
                }
            }
        }

        // Adaptive interval
        currentInterval = hadWork
            ? Math.max(MIN_INTERVAL, pollInterval)
            : Math.min(MAX_INTERVAL, Math.max(currentInterval * BACKOFF_FACTOR, pollInterval));

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`[CONEXIÓN] No puedo alcanzar el servidor en ${config.apiUrl}`);
        } else {
            console.error(`[ERROR] ${error.message}`);
        }
        currentInterval = Math.min(MAX_INTERVAL, currentInterval * BACKOFF_FACTOR);
    }

    pollTimer = setTimeout(poll, currentInterval);
}

// ============================================================================
// INICIO
// ============================================================================
console.log(`
##########################################
#   AGENTE DE IMPRESION - TAKEASYGO      #
##########################################
Estado:    Iniciado y Escuchando
Tenant:    ${config.tenantSlug}
Sede:      ${config.locationId}
API:       ${config.apiUrl}
Intervalo: ${config.pollInterval}ms (adaptativo: ${MIN_INTERVAL}ms - ${MAX_INTERVAL}ms)
AutoUpdate: ${config.autoUpdate ? 'HABILITADO' : 'DESHABILITADO'}
Version:   ${LOCAL_VERSION}
------------------------------------------
`);

// Detectar impresoras Windows al arrancar
refreshWindowsPrinters();

// Refrescar cada 5 minutos (para detectar impresoras agregadas/quitadas)
setInterval(refreshWindowsPrinters, 5 * 60 * 1000);

// Verificar actualizaciones al arrancar
checkForUpdate();
setInterval(checkForUpdate, 60 * 60 * 1000);

// Iniciar polling
pollTimer = setTimeout(poll, currentInterval);
