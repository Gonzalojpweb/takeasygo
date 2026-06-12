const axios = require('axios');
const net = require('node:net');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---
const CONFIG_PATH = path.join(__dirname, 'config.json');

let config = {
    apiUrl: 'https://tu-dominio.com',
    tenantSlug: 'tu-restaurante',
    locationId: 'PEGAR_ID_DE_SEDE_AQUI',
    pollInterval: 3000
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
};

const SANITIZE_MAP = {
    'á':'a','é':'e','í':'i','ó':'o','ú':'u',
    'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U',
    'ñ':'n','Ñ':'N','ü':'u','Ü':'U',
    '¿':'','¡':'','€':'EUR','º':'o','ª':'a'
};

function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[áéíóúÁÉÍÓÚñÑüÜ¿¡€ºª]/g, c => SANITIZE_MAP[c] || c);
}

function buf(input) {
    if (Buffer.isBuffer(input)) return input;
    if (typeof input === 'string') return Buffer.from(sanitizeText(input));
    return Buffer.from(String(input));
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
                await sendToPrinter(job.printerConfig.ip, job.printerConfig.port, job.buffer);
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
            ? c.selectedOptions.map(o => o.name).filter(Boolean)
            : [];
        if (sels.length > 0) {
            const prefix = group ? group + ': ' : '';
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
function generateTicket(order, role, columns = 32) {
    let chunks = [];
    const customer = order.customer || {};
    const allItems = order.items || [];

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

    chunks.push(ESC_POS.INIT, ESC_POS.ALIGN_CENTER);
    chunks.push(Buffer.from([0x1b, 0x33, 36]));

    if (role === 'cashier') {
        chunks.push(ESC_POS.TEXT_SIZE_LARGE, ESC_POS.BOLD_ON);
        chunks.push(buf(`${(order.location?.locationName?.toUpperCase()) || 'MI NEGOCIO'}\n`));
        chunks.push(ESC_POS.TEXT_SIZE_NORMAL, ESC_POS.BOLD_OFF);
        chunks.push(buf(`TICKET DE PAGO\n`));
    } else {
        chunks.push(ESC_POS.TEXT_SIZE_LARGE, ESC_POS.BOLD_ON);
        chunks.push(buf(`ORDEN: ${order.orderNumber}\n`));
        chunks.push(ESC_POS.TEXT_SIZE_NORMAL, ESC_POS.BOLD_OFF);

        let sectorName = "COCINA";
        if (role === 'bar') sectorName = "BARRA / BEBIDAS";

        chunks.push(buf(`*** ${sectorName} ***\n`));
    }

    chunks.push(buf(`${lineStr}\n`));
    chunks.push(ESC_POS.ALIGN_LEFT);
    chunks.push(buf(`Fecha: ${new Date(order.createdAt).toLocaleString()}\n`));

    // Tipo de entrega
    if (order.orderMode) {
        const modeLabel = order.orderMode === 'takeaway' ? 'PARA LLEVAR' : 'EN LOCAL';
        chunks.push(buf(`Tipo: ${modeLabel}\n`));
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

    // Info del cliente
    chunks.push(ESC_POS.BOLD_ON);
    chunks.push(buf(`Cliente: ${customer.name || ''}\n`));
    if (customer.phone) {
        chunks.push(buf(`Tel: ${customer.phone}\n`));
    }
    chunks.push(ESC_POS.BOLD_OFF);

    // Observaciones del cliente (prominente)
    if (order.notes) {
        chunks.push(buf(`${lineStr}\n`));
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(buf(`OBS: ${order.notes}\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    chunks.push(buf(`${lineStr}\n`));

    let lastCategory = null;
    itemsToPrint.forEach(item => {
        // Badge de tipo de item
        if (item.itemType === 'promotion') {
            chunks.push(buf(`[PROMOCIÓN]\n`));
        } else if (item.itemType === 'reward') {
            chunks.push(buf(`[RECOMPENSA]\n`));
        }

        const line = `${item.quantity}x ${item.name}`;

        // Nombre de categoría (solo cuando cambia)
        const currentCategory = (item.categoryName && item.itemType !== 'promotion' && item.itemType !== 'reward')
            ? item.categoryName : null;
        if (currentCategory && currentCategory !== lastCategory) {
            chunks.push(buf(`[${currentCategory}]\n`));
        }
        lastCategory = currentCategory;

        if (role === 'cashier') {
            const price = `$${money(item.price * item.quantity)}`;
            const dots = '.'.repeat(Math.max(2, columns - line.length - price.length));
            chunks.push(buf(`${line}${dots}${price}\n`));
        } else {
            chunks.push(ESC_POS.BOLD_ON);
            chunks.push(buf(`${line}\n`));
            chunks.push(ESC_POS.BOLD_OFF);
        }

        // Mostrar descripción del ítem si existe
        if (item.description) {
            const desc = item.description.length > columns
                ? item.description.substring(0, columns - 3) + '...'
                : item.description
            chunks.push(buf(`  ${desc}\n`));
        }

        // Mostrar variante seleccionada
        if (item.selectedVariant) {
            chunks.push(buf(`  > Variante: ${item.selectedVariant.name}\n`));
        }

        // Mostrar customizaciones (incluye subGroups recursivamente)
        printCustomizations(item.customizations, chunks, '  ');
        chunks.push(buf('\n\n'));
    });

    chunks.push(buf(`${lineStr}\n`));
    if (role === 'cashier') {
        chunks.push(ESC_POS.ALIGN_RIGHT, ESC_POS.BOLD_ON);
        chunks.push(buf(`TOTAL: $${money(order.total)}\n`));
    }

    chunks.push(buf('\n\n\n\n'), ESC_POS.CUT);
    return Buffer.concat(chunks);
}

// --- POLLING PRINCIPAL ---
async function poll() {
    try {
        const url = `${config.apiUrl}/api/${config.tenantSlug}/print-jobs?locationId=${config.locationId}`;
        const response = await axios.get(url);
        const { orders, printers } = response.data;

        if (!orders || orders.length === 0) return;

        console.log(`[POLL] ${orders.length} pedidos nuevos detectados.`);

        for (const order of orders) {
            for (const printer of printers) {
                for (const role of printer.roles) {
                    console.log(`[QUEUE] Orden ${order.orderNumber} → ${printer.name} (${role})`);

                    let ticketBuffer;
                    try {
                        ticketBuffer = generateTicket(order, role, printer.paperWidth === 80 ? 48 : 32);
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
Estado:  Iniciado y Escuchando
Tenant:  ${config.tenantSlug}
Sede:    ${config.locationId}
API:     ${config.apiUrl}
------------------------------------------
`);

setInterval(poll, config.pollInterval);
poll();
