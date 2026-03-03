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

// --- LOGICA DE TRASMISIÓN (TCP RAW) ---
async function sendToPrinter(ip, port, dataBuffer) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(5000);

        client.connect(port, ip, () => {
            console.log(`[TCP] Enviando datos a ${ip}:${port}...`);
            client.write(dataBuffer, (err) => {
                if (err) return reject(err);
                client.end();
                setTimeout(() => {
                    client.destroy();
                    resolve();
                }, 200);
            });
        });

        client.on('error', (err) => {
            client.destroy();
            reject(err);
        });

        client.on('timeout', () => {
            client.destroy();
            reject(new Error('TIMEOUT: La impresora no respondió'));
        });
    });
}

// --- GESTOR DE COLAS SECUENCIAL ---
// Asegura que si hay 10 tickets, se impriman en orden y no al mismo tiempo
class JobManager {
    constructor() {
        this.queues = new Map();
    }

    async enqueue(printerUid, printerConfig, buffer, onComplete) {
        if (!this.queues.has(printerUid)) this.queues.set(printerUid, Promise.resolve());

        const tail = this.queues.get(printerUid);
        const next = tail.then(async () => {
            try {
                await sendToPrinter(printerConfig.ip, printerConfig.port, buffer);
                await onComplete(true);
            } catch (err) {
                console.error(`[FALLO] ${printerConfig.name}: ${err.message}`);
                await onComplete(false, err.message);
            }
        });

        this.queues.set(printerUid, next.catch(() => undefined));
        return next;
    }
}

const jobManager = new JobManager();

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

    if (role === 'cashier') {
        chunks.push(ESC_POS.TEXT_SIZE_LARGE, ESC_POS.BOLD_ON);
        chunks.push(Buffer.from(`${(order.location?.locationName?.toUpperCase()) || 'MI NEGOCIO'}\n`));
        chunks.push(ESC_POS.TEXT_SIZE_NORMAL, ESC_POS.BOLD_OFF);
        chunks.push(Buffer.from(`TICKET DE PAGO\n`));
    } else {
        chunks.push(ESC_POS.TEXT_SIZE_LARGE, ESC_POS.BOLD_ON);
        chunks.push(Buffer.from(`ORDEN: ${order.orderNumber}\n`));
        chunks.push(ESC_POS.TEXT_SIZE_NORMAL, ESC_POS.BOLD_OFF);

        let sectorName = "COCINA";
        if (role === 'bar') sectorName = "BARRA / BEBIDAS";

        chunks.push(Buffer.from(`*** ${sectorName} ***\n`));
    }

    chunks.push(Buffer.from(`${lineStr}\n`));
    chunks.push(ESC_POS.ALIGN_LEFT);
    chunks.push(Buffer.from(`Fecha: ${new Date(order.createdAt).toLocaleString()}\n`));

    // Tipo de entrega
    if (order.deliveryMethod) {
        chunks.push(Buffer.from(`Tipo: ${order.deliveryMethod}\n`));
    }

    // Info del cliente
    chunks.push(ESC_POS.BOLD_ON);
    chunks.push(Buffer.from(`Cliente: ${customer.name || ''} ${customer.lastname || ''}\n`));
    if (customer.phone) {
        chunks.push(Buffer.from(`Tel: ${customer.phone}\n`));
    }
    chunks.push(ESC_POS.BOLD_OFF);

    // Observaciones del cliente (prominente)
    if (role !== 'cashier' && order.notes) {
        chunks.push(Buffer.from(`${lineStr}\n`));
        chunks.push(ESC_POS.BOLD_ON);
        chunks.push(Buffer.from(`OBS: ${order.notes}\n`));
        chunks.push(ESC_POS.BOLD_OFF);
    }

    chunks.push(Buffer.from(`${lineStr}\n`));

    itemsToPrint.forEach(item => {
        const line = `${item.quantity}x ${item.name}`;

        if (role === 'cashier') {
            const price = `$${money(item.price * item.quantity)}`;
            const dots = '.'.repeat(Math.max(2, columns - line.length - price.length));
            chunks.push(Buffer.from(`${line}${dots}${price}\n`));
        } else {
            chunks.push(Buffer.from(`${line}\n`));
        }

        // Mostrar customizaciones en todos los tickets (cocina, barra y caja)
        if (item.customizations && item.customizations.length > 0) {
            item.customizations.forEach(c => {
                const group = c.groupName || c.group || '';
                const sels = (c.selections && Array.isArray(c.selections) && c.selections.length > 0)
                    ? c.selections
                    : (c.selected || c.option ? [c.selected || c.option] : []);
                if (sels.length > 0) {
                    const prefix = group ? group + ': ' : '';
                    chunks.push(Buffer.from(`  > ${prefix}${sels.join(', ')}\n`));
                }
            });
        }
    });

    chunks.push(Buffer.from(`${lineStr}\n`));
    if (role === 'cashier') {
        chunks.push(ESC_POS.ALIGN_RIGHT, ESC_POS.BOLD_ON);
        chunks.push(Buffer.from(`TOTAL: $${money(order.total)}\n`));
    }

    chunks.push(Buffer.from('\n\n\n'), ESC_POS.CUT);
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
                    // Solo imprimimos si el rol coincide (Kitchen/Cashier)
                    console.log(`[QUEUE] Agregando Orden ${order.orderNumber} para ${printer.name} (${role})`);

                    const ticketBuffer = generateTicket(order, role, printer.paperWidth === 80 ? 48 : 32);

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
