const axios = require('axios');
const net = require('node:net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { renderTicketToCanvas } = require('./ticket-renderer');
const { canvasToEscPos } = require('./raster-encoder');

// --- LEER VERSIÓN LOCAL ---
let LOCAL_VERSION = '0.0.0';
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    LOCAL_VERSION = pkg.version || '0.0.0';
} catch (e) {
    console.error('[UPDATE] No se pudo leer package.json, usando versión 0.0.0');
}

// --- AUTO-UPDATE ---
const SERVICE_NAME = 'Takeasygo Printer Agent';
const AGENT_DIR = __dirname;
const AGENT_EXE = process.argv[0]; // node.exe or printer-agent.exe

function isPkg() {
    return typeof process.pkg !== 'undefined';
}

function isWindows() {
    return process.platform === 'win32';
}

async function checkForUpdate() {
    if (!config.autoUpdate) {
        console.log('[UPDATE] Auto-update deshabilitado. Para habilitar, agregar "autoUpdate": true en config.json');
        return;
    }
    try {
        const url = `${config.apiUrl}/api/agent/version`;
        const response = await axios.get(url, { timeout: 5000 });
        const { version: remoteVersion, downloadUrl } = response.data;

        console.log(`[UPDATE] Versión local: ${LOCAL_VERSION} | Versión remota: ${remoteVersion}`);

        if (!remoteVersion || remoteVersion === LOCAL_VERSION) {
            console.log('[UPDATE] El agente está actualizado.');
            return;
        }

        console.log(`[UPDATE] Nueva versión disponible: ${remoteVersion}. Descargando...`);
        await performUpdate(downloadUrl);
    } catch (error) {
        console.error(`[UPDATE] No se pudo verificar versión: ${error.message}`);
        console.log('[UPDATE] Continuando con la versión actual...');
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
            console.error('[UPDATE] Archivo descargado demasiado pequeño, abortando.');
            fs.unlinkSync(tempFile);
            return;
        }

        console.log(`[UPDATE] Descargado: ${tempFile} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
        console.log('[UPDATE] Creando script de actualización...');

        if (isWindows()) {
            await applyUpdateWindows(tempFile);
        } else {
            await applyUpdateLinux(tempFile);
        }
    } catch (error) {
        console.error(`[UPDATE] Error descargando actualización: ${error.message}`);
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        }
    }
}

function applyUpdateWindows(tempFile) {
    const script = path.join(os.tmpdir(), 'takeasygo-update.bat');
    const currentExe = isPkg() ? process.execPath : process.argv[1];
    const agentDir = path.dirname(currentExe);

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
    console.log(`[UPDATE] Script creado: ${script}`);
    console.log('[UPDATE] Lanzando script de actualización y reiniciando...');

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
    const agentDir = path.dirname(currentExe);

    const content = `#!/bin/bash
echo "=================================================="
echo "   ACTUALIZANDO AGENTE DE IMPRESION - TAKEASYGO"
echo "=================================================="
echo ""
echo "Esperando a que el agente se detenga..."
sleep 3

# Detectar pm2 o systemctl
if command -v pm2 &> /dev/null; then
    echo "Deteniendo servicio con pm2..."
    pm2 stop printer-agent 2>/dev/null || true
    sleep 2
    echo "Reemplazando archivos..."
    cp -f "${tempFile}" "${currentExe}"
    chmod +x "${currentExe}"
    echo "Iniciando servicio..."
    pm2 start printer-agent || pm2 resurrect
elif systemctl is-active --quiet printer-agent 2>/dev/null; then
    echo "Deteniendo servicio con systemctl..."
    sudo systemctl stop printer-agent
    sleep 2
    echo "Reemplazando archivos..."
    cp -f "${tempFile}" "${currentExe}"
    chmod +x "${currentExe}"
    echo "Iniciando servicio..."
    sudo systemctl start printer-agent
else
    echo "No se detectó pm2 ni systemd. Reemplazando archivos..."
    cp -f "${tempFile}" "${currentExe}"
    chmod +x "${currentExe}"
    echo "Reiniciando con nohup..."
    nohup "${currentExe}" > /dev/null 2>&1 &
fi

echo ""
echo "=================================================="
echo "   ACTUALIZACION COMPLETADA"
echo "=================================================="
rm -f "${script}"
`;

    fs.writeFileSync(script, content, 'utf8');
    fs.chmodSync(script, '755');
    console.log(`[UPDATE] Script creado: ${script}`);
    console.log('[UPDATE] Lanzando script de actualización y reiniciando...');

    spawn('bash', [script], {
        detached: true,
        stdio: 'ignore',
    }).unref();

    process.exit(0);
}
const CONFIG_PATH = path.join(__dirname, 'config.json');

let config = {
    apiUrl: null,
    tenantSlug: null,
    locationId: null,
    pollInterval: 15000,
    autoUpdate: false
};

// Carga o creación de configuración inicial
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        config = { ...config, ...savedConfig };
    } catch (e) {
        console.error('Error leyendo config.json, usando valores por defecto');
    }
} else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('✅ Creado config.json por defecto.');
}

if (!config.apiUrl || !config.tenantSlug || !config.locationId ||
    config.tenantSlug.startsWith('TU-') || config.locationId.startsWith('TU-')) {
    console.log('');
    console.log('⚠️  Configuracion no completada.');
    console.log('    Ejecuta SETUP.bat para configurar el agente.');
    console.log('');
    process.exit(1);
}

// --- COMANDOS ESC/POS ---
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
    TEXT_SIZE_TRIPLE_BOTH: Buffer.from([0x1d, 0x21, 0x22]),
    LINE_SPACING: (n) => Buffer.from([0x1b, 0x33, n]),
    CODE_PAGE: Buffer.from([0x1b, 0x74, 43]), // CP858 (Latin-1 + Euro)
};

// --- MAPEO DE TAMAÑOS DE FUENTE ---
function getFontSizeCommand(size) {
    switch (size) {
        case 'normal':
            return ESC_POS.TEXT_SIZE_NORMAL;
        case 'large':
            return ESC_POS.TEXT_SIZE_LARGE;
        case 'double':
            return ESC_POS.TEXT_SIZE_DOUBLE_BOTH;
        case 'triple':
            return ESC_POS.TEXT_SIZE_TRIPLE_BOTH;
        default:
            return ESC_POS.TEXT_SIZE_NORMAL;
    }
}

const NON_LATIN1_RE = /[^\x00-\xFF]/g;

function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    return str.replace(NON_LATIN1_RE, '');
}

function buf(input) {
    if (Buffer.isBuffer(input)) return input;
    if (typeof input === 'string') return Buffer.from(sanitizeText(input), 'latin1');
    return Buffer.from(String(input), 'latin1');
}

// --- LOGICA DE TRASMISIÓN (TCP RAW) ---
async function sendToPrinter(ip, port, dataBuffer) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(8000);

        client.on('error', (err) => {
            client.destroy();
            reject(err);
        });

        client.on('timeout', () => {
            client.destroy();
            reject(new Error('TIMEOUT: La impresora no respondió'));
        });

        client.connect(port, ip, () => {
            console.log(`[TCP] Conectado a ${ip}:${port}, enviando ${dataBuffer.length} bytes...`);
            client.write(dataBuffer, (err) => {
                if (err) return reject(err);
                console.log(`[TCP] Datos escritos, finalizando...`);
                client.end(() => {
                    client.destroy();
                    resolve();
                });
            });
        });
    });
}

// --- SOPORTE USB (vía Win32 Spooler con PowerShell) ---
function listUSBPrinters() {
    const { execSync } = require('child_process');
    try {
        const output = execSync(
            'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
            { encoding: 'utf8', timeout: 5000 }
        );
        const printers = output.trim().split(/\r?\n/).filter(Boolean);
        if (printers.length > 0) {
            console.log(`[USB] Impresoras detectadas en Windows: ${printers.join(', ')}`);
        } else {
            console.log('[USB] No se encontraron impresoras instaladas');
        }
    } catch (e) {
        console.log('[USB] No se pudo listar impresoras');
    }
}

async function sendToPrinterUSB(printerName, dataBuffer) {
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `ticket-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, dataBuffer);

    return new Promise((resolve, reject) => {
        const psScript = path.join(__dirname, 'send-raw.ps1');
        const child = execFile(
            'powershell',
            [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-File', psScript,
                '-PrinterName', printerName,
                '-FilePath', tmpFile
            ],
            { timeout: 15000 },
            (err, stdout, stderr) => {
                try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
                if (err) {
                    reject(new Error(stderr.trim() || err.message));
                } else {
                    resolve(stdout.trim());
                }
            }
        );
    });
}

// --- GESTOR DE COLAS SECUENCIAL ---
// Asegura que si hay 10 tickets, se impriman en orden y no al mismo tiempo
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
                    await sendToPrinterUSB(job.printerConfig.ip, job.buffer);
                } else {
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

// --- IMPRIME CUSTOMIZACIONES (incluso subGroups anidados) ---
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

// --- GENERADOR DE TICKETS (Lógica compartida) ---
function generateTicket(order, role, columns = 32, printSettings = null) {
    let chunks = [];
    const customer = order.customer || {};
    const allItems = order.items || [];

    // CONFIGURACIÓN POR DEFECTO SI NO SE PROPORCIONA
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

    // FILTRADO DE ITEMS SEGÚN ROL
    let itemsToPrint = [];
    if (role === 'cashier') {
        itemsToPrint = allItems;
    } else if (role === 'kitchen') {
        itemsToPrint = allItems.filter(i => !i.printRole || i.printRole === 'kitchen' || i.printRole === 'both');
    } else if (role === 'bar') {
        itemsToPrint = allItems.filter(i => i.printRole === 'bar' || i.printRole === 'both');
    }

    // Si no hay items para este rol, no generamos ticket
    if (itemsToPrint.length === 0) return null;

    const lineStr = '-'.repeat(columns);
    const money = (v) => Number(v || 0).toLocaleString('es-AR');

    chunks.push(ESC_POS.INIT, ESC_POS.CODE_PAGE, ESC_POS.ALIGN_CENTER);
    chunks.push(ESC_POS.LINE_SPACING(settings.lineSpacing));

    // Encabezado personalizado (si está configurado)
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

    // Tipo de entrega
    if (order.orderMode) {
        const modeLabel = order.orderMode === 'takeaway' ? 'PARA LLEVAR' : 'DELIVERY';
        chunks.push(buf(`Tipo: ${modeLabel}\n`));
    }

    // Pago en efectivo
    if (order.payment?.method === 'cash') {
        chunks.push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON);
        chunks.push(buf(`=== PAGO EFECTIVO ===\n`));
        chunks.push(ESC_POS.BOLD_OFF, ESC_POS.ALIGN_LEFT);
    }

    // Dirección de delivery
    if (order.orderMode === 'delivery' && order.deliveryAddress) {
        const addr = order.deliveryAddress;
        chunks.push(ESC_POS.BOLD_ON);
        let addrLine = `Dir: ${addr.street} ${addr.number}`;
        if (addr.apt) addrLine += ` (${addr.apt})`;
        chunks.push(buf(`${addrLine}\n`));
        chunks.push(buf(`${addr.city}\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    // Hora programada (destacado en negrita)
    if (order.orderTiming === 'scheduled' && order.scheduledPickupAt) {
        const schedDate = new Date(order.scheduledPickupAt);
        const schedTime = schedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const schedDateStr = schedDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`PROGRAMADO: ${schedDateStr} ${schedTime} hs\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    // Info del cliente (según configuración)
    if (settings.showCustomerInfo) {
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`Cliente: ${(customer.name || '').toUpperCase()}\n`));
        if (customer.phone) {
            chunks.push(buf(`Tel: ${customer.phone}\n`));
        }
        chunks.push(ESC_POS.BOLD_OFF);
    }

    // Observaciones del cliente (según configuración)
    if (settings.showOrderNotes && order.notes) {
        chunks.push(buf(`${lineStr}\n`));
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`OBS: ${order.notes}\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    chunks.push(buf(`${lineStr}\n`));

    let lastCategory = null;

    // ── Agrupar items de promo consecutivos con el mismo promotionTitle ──
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
            // ── Item normal o reward ──
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

            if (settings.showPrices && role === 'cashier') {
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
            // ── Grupo de promo: header + items listados ──
            const promoTitle = group.promotionTitle.toUpperCase();
            const totalQty = group.totalQuantity;

            if (settings.showCategory) {
                lastCategory = null;
            }

            if (settings.showPrices && role === 'cashier') {
                const headerLine = `${totalQty}x ${promoTitle}`;
                const headerPrice = `$${money(group.items.reduce((s, i) => s + i.price * i.quantity, 0))}`;
                const dots = '.'.repeat(Math.max(2, columns - headerLine.length - headerPrice.length));
                chunks.push(buf(`${headerLine}${dots}${headerPrice}\n`));
            } else {
                chunks.push(ESC_POS.TEXT_SIZE_DOUBLE_HEIGHT, ESC_POS.BOLD_ON);
                chunks.push(buf(`${totalQty}x ${promoTitle}\n`));
                chunks.push(ESC_POS.BOLD_OFF, getFontSizeCommand(settings.fontSize));
            }

            // Descripción corta de la promo
            if (settings.showDescriptions && group.items[0].shortDescription) {
                const short = group.items[0].shortDescription.length > columns
                    ? group.items[0].shortDescription.substring(0, columns - 3) + '...'
                    : group.items[0].shortDescription;
                chunks.push(buf(`  ${short.toUpperCase()}\n`));
            }

            // Listar items del combo
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

    // Promo de superadmin
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
    if (settings.showTotal && role === 'cashier') {
        chunks.push(ESC_POS.ALIGN_RIGHT, ESC_POS.BOLD_ON);
        chunks.push(buf(`TOTAL: $${money(order.total)}\n`));
    }

    // Pie de página personalizado (si está configurado)
    if (settings.footerTemplate) {
        chunks.push(ESC_POS.ALIGN_CENTER);
        chunks.push(buf(`${settings.footerTemplate}\n`));
    }

    chunks.push(buf('\n\n\n\n'), ESC_POS.CUT);
    return Buffer.concat(chunks);
}

// --- PROCESA UN TRABAJO DE PRE-CIERRE (CIERRE DE TURNO) ---
function processPreCloseJob(preCloseJob, printers) {
    const printer = printers.find(p => p.name === preCloseJob.printerName);
    if (!printer) {
        console.error(`[PRECLOSE] Impresora "${preCloseJob.printerName}" no encontrada para job ${preCloseJob._id}`);
        return;
    }

    console.log(`[PRECLOSE] Encolando cierre de turno → ${printer.name}`);
    const buffer = Buffer.from(preCloseJob.data, 'base64');

    jobManager.enqueue(printer.uid, printer, buffer, async (success, errorMsg) => {
        try {
            await axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
                preCloseJobId: preCloseJob._id,
                printerName: printer.name,
                success,
                errorMsg
            });
            console.log(`[CLOUD] Estado sincronizado para PreClose ${preCloseJob._id}`);
        } catch (e) {
            console.error(`[CLOUD ERROR] No se pudo confirmar pre-close: ${e.message}`);
        }
    });
}

// --- POLLING PRINCIPAL ---
async function poll() {
    try {
        const url = `${config.apiUrl}/api/${config.tenantSlug}/print-jobs?locationId=${config.locationId}`;
        const response = await axios.get(url);
        const { orders, printers, preCloseJobs, pollInterval: serverPollInterval } = response.data;

        if (serverPollInterval && serverPollInterval !== config.pollInterval) {
            config.pollInterval = serverPollInterval;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
            clearInterval(pollTimer);
            pollTimer = setInterval(poll, config.pollInterval);
            console.log(`[CONFIG] pollInterval actualizado a ${config.pollInterval}ms`);
        }

        // --- DIAGNÓSTICO: SIEMPRE mostrar qué devuelve el servidor ---
        const orderCount = (orders || []).length;
        const printerCount = (printers || []).length;
        const preCloseCount = (preCloseJobs || []).length;
        console.log(`[POLL] órdenes=${orderCount} impresoras=${printerCount} preClose=${preCloseCount}`);

        if (printerCount === 0) {
            console.warn('[WARN] No hay impresoras configuradas para esta sede. El agente no puede imprimir nada.');
            console.warn('[WARN] Verificar en el panel de TakeasyGO: Configuración > Impresoras > Agregar impresora.');
        }

        // Procesar trabajos de pre-cierre primero
        if (preCloseJobs && preCloseJobs.length > 0) {
            console.log(`[POLL] ${preCloseJobs.length} trabajo(s) de cierre de turno detectado(s).`);
            for (const job of preCloseJobs) {
                processPreCloseJob(job, printers);
            }
        }

        if (!orders || orders.length === 0) return;

        console.log(`[POLL] ${orders.length} pedidos nuevos detectados.`);

        for (const order of orders) {
            for (const printer of printers) {
                for (const role of printer.roles) {
                    console.log(`[QUEUE] Orden ${order.orderNumber} → ${printer.name} (${role})`);

                    let ticketBuffer;
                    try {
                        const settings = printer.printSettings?.[role] || null;
                        const paperWidthDots = printer.paperWidth === 80 ? 576 : 384;

                        if (settings?.mode === 'image') {
                            const canvas = renderTicketToCanvas(order, role, paperWidthDots, settings, {
                                restaurantName: order.location?.locationName || '',
                            });
                            if (!canvas) {
                                console.log(`[SKIP] Orden ${order.orderNumber} no tiene items para ${printer.name} (${role})`);
                                continue;
                            }
                            ticketBuffer = canvasToEscPos(canvas, paperWidthDots);
                        } else {
                            ticketBuffer = generateTicket(order, role, printer.paperWidth === 80 ? 48 : 32, settings);
                        }
                    } catch (err) {
                        console.error(`[ERROR] generateTicket falló: ${err.message}`);
                        continue;
                    }

                    if (!ticketBuffer) {
                        console.log(`[SKIP] Orden ${order.orderNumber} no tiene items para ${printer.name} (${role})`);
                        continue;
                    }

                    jobManager.enqueue(printer.uid, printer, ticketBuffer, async (success, errorMsg) => {
                        try {
                            await axios.post(`${config.apiUrl}/api/${config.tenantSlug}/print-jobs`, {
                                orderId: order._id,
                                printerName: printer.name,
                                role: role,
                                success,
                                errorMsg
                            });
                            console.log(`[CLOUD] Estado sincronizado para Orden ${order.orderNumber}`);
                        } catch (e) {
                            console.error(`[CLOUD ERROR] No se pudo confirmar impresión: ${e.message}`);
                        }
                    });
                }
            }
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`[CONEXIÓN] Error: No puedo alcanzar el servidor en ${config.apiUrl}`);
        } else {
            console.error(`[ERROR] ${error.message}`);
        }
    }
}

// Inicio
console.log(`
##########################################
#   AGENTE DE IMPRESIÓN - TAKEASYGO      #
##########################################
Estado:   Iniciado y Escuchando
Tenant:   ${config.tenantSlug}
Sede:     ${config.locationId}
API:      ${config.apiUrl}
Intervalo: ${config.pollInterval}ms
AutoUpdate: ${config.autoUpdate ? 'HABILITADO' : 'DESHABILITADO'}
------------------------------------------
`);

listUSBPrinters();

// Verificar actualizaciones al arrancar (en background, no bloquea el arranque)
checkForUpdate();

// Verificar actualizaciones cada hora
setInterval(checkForUpdate, 60 * 60 * 1000);

let pollTimer = setInterval(poll, config.pollInterval);
poll();
