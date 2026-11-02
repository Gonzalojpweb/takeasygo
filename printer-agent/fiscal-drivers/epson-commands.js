// ============================================================================
// Epson TM-T900FA (2da generación, firmware Vesta) — armado de comandos
// ============================================================================
// Fuente: «Manual de Especificaciones IMPRESORA FISCAL ARGENTINA» (protocolo
// de comunicación, firmware Vesta, rev. 09/03/2018) y los ejemplos oficiales
// de EpsonFiscalDriver 3.07.00 (cmd_templates). Formato de un comando para la
// DLL: «CMD|EXT|campo1|campo2|…», CMD y EXT en hexadecimal (4 dígitos).
//
// Números (tipo N «e,d»): SIN separador decimal, con d decimales implícitos.
//   Cantidad 5,4 ⇒ 1 unidad = "10000" · Precio 7,4 ⇒ $100 = "1000000"
//   Tasa IVA 2,2 ⇒ 21 % = "2100" · Montos 10,2 ⇒ $90 = "9000" (centavos)
//
// Este archivo es puro (sin DLL): se prueba con `node --test`.
// ============================================================================

// ── Comandos (sección 6 del manual) ─────────────────────────────────────────
const CMD = {
    STATUS: '0001',          // 6.1.1 Obtener Estado
    COUNTERS: '0830',        // 6.6.12 Información de Contadores
    TICKET_OPEN: '0A01',     // 6.8.1
    TICKET_ITEM: '0A02',     // 6.8.2
    TICKET_DISCOUNT: '0A04', // 6.8.4
    TICKET_PAYMENT: '0A05',  // 6.8.5
    TICKET_CLOSE: '0A06',    // 6.8.6
    TICKET_CANCEL: '0A07',   // 6.8.7
};

/** Tipo de documento para «Información de Contadores» (08 30). */
const DOC_TYPE = { TIQUE: 83, TIQUE_NC: 110 };

// ── Estado fiscal (tabla 7-1) ───────────────────────────────────────────────
const FISCAL_MODE = { 0: 'bloqueado', 1: 'manufactura', 2: 'entrenamiento', 3: 'fiscal' };

function decodeFiscalStatus(value) {
    const v = Number(value) & 0xffff;
    return {
        mode: FISCAL_MODE[(v >> 14) & 0b11],
        certificatesExpiring: Boolean((v >> 13) & 1),
        technicalMode: Boolean((v >> 12) & 1),
        fiscalMemory: (v >> 10) & 0b11,      // 0 ok · 1 cerca de llenarse · 2 llena · 3 desperfecto
        transactionMemory: (v >> 8) & 0b11,
        dayOpen: Boolean((v >> 7) & 1),
        substate: (v >> 4) & 0b111,
        documentInProgress: v & 0b1111,       // 0 = ninguno · 1 = tique / tique NC
    };
}

// ── Estado de impresora (tabla 7-2) ─────────────────────────────────────────
function decodePrinterStatus(value) {
    const v = Number(value) & 0xffff;
    return {
        offline: Boolean((v >> 15) & 1),
        error: Boolean((v >> 14) & 1),
        coverOpen: Boolean((v >> 13) & 1),
    };
}

// ── Formatos ────────────────────────────────────────────────────────────────

/** Texto apto para un campo: sin «|» (separador), sin saltos ni acentos. */
function text(value, max = 40) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[|\r\n\t]/g, ' ')
        .replace(/[^\x20-\x7E]/g, '')
        .trim()
        .slice(0, max);
}

/** Entero ≥ 0 escalado, sin separador decimal. */
function scaled(n) {
    if (!Number.isFinite(n) || n < 0) throw new Error(`Monto inválido: ${n}`);
    return String(Math.round(n));
}

/** Cantidad 5,4 (1 ⇒ "10000"). */
function quantity(q) {
    return scaled(q * 10000);
}

/** Tasa de IVA 2,2 (21 ⇒ "2100"; 10,5 ⇒ "1050"). */
function ivaRate(pct) {
    return scaled(pct * 100);
}

// ── Pagos: códigos de forma de pago (6.8.5) ─────────────────────────────────
const PAYMENT_CODES = {
    cash: 8,               // Efectivo
    efectivo: 8,
    posnet_debit: 21,      // Tarjeta de débito
    debit: 21,
    posnet_credit: 20,     // Tarjeta de crédito
    credit: 20,
    transfer: 23,          // Transferencia bancaria
};

function paymentFields(method) {
    const code = PAYMENT_CODES[method];
    if (code) return { code, detail: '' };
    const label = method === 'mercadopago' ? 'Mercado Pago' : method === 'kripton' ? 'Kripton' : String(method || 'Otro');
    return { code: 99, detail: text(label, 30) };   // 99 - Otros medios de pago
}

/**
 * Comandos de un TIQUE a consumidor final, en orden.
 * payload = { lines:[{description, quantity, totalCents, ivaRate}], discountCents,
 *             payments:[{method, amountCents}], issuerIvaCondition }
 */
function buildTicketCommands(payload) {
    const lines = (payload && payload.lines) || [];
    if (lines.length === 0) throw new Error('La venta no tiene ítems');
    const noIva = payload.issuerIvaCondition && payload.issuerIvaCondition !== 'responsable_inscripto';

    const cmds = [`${CMD.TICKET_OPEN}|0000`];
    lines.forEach((l, i) => {
        const qty = Number(l.quantity) > 0 ? Number(l.quantity) : 1;
        const total = Number(l.totalCents);
        if (!Number.isInteger(total) || total < 0) throw new Error(`Importe inválido en «${l.description}»`);
        // Precio unitario 7,4 con IVA incluido: total del ítem / cantidad. La
        // impresora multiplica y redondea a 2 decimales (6.8.2, notas).
        const unit4 = (total * 100) / qty;
        const rate = noIva ? 0 : Number(l.ivaRate) || 0;
        const ivaCondition = noIva ? 0 : rate > 0 ? 7 : 2;   // 7 gravado · 2 exento · 0 no corresponde
        cmds.push([
            CMD.TICKET_ITEM, '0000',
            '', '', '', '',                       // 1-4 descripciones extra
            text(l.description, 40) || 'Item',    // 5 descripción
            quantity(qty),                        // 6 cantidad 5,4
            scaled(unit4),                        // 7 precio unitario 7,4
            ivaRate(rate),                        // 8 tasa de IVA 2,2
            '', '', '', '',                       // 9-12 imp. internos, MTX
            String(i + 1),                        // 13 código interno (obligatorio si no hay MTX)
            '7',                                  // 14 unidad de medida: 7 = Unidad
            String(ivaCondition),                 // 15 condición frente al IVA
        ].join('|'));
    });

    const discount = Number(payload.discountCents) || 0;
    if (discount > 0) {
        // Descuento GLOBAL: tasa de IVA vacía (6.8.4, requerimientos).
        cmds.push([CMD.TICKET_DISCOUNT, '0000', 'Descuento', scaled(discount), '', 'DTO', ''].join('|'));
    }

    for (const p of payload.payments || []) {
        const amount = Number(p.amountCents) || 0;
        if (amount <= 0) continue;
        const { code, detail } = paymentFields(p.method);
        cmds.push([
            CMD.TICKET_PAYMENT, '0000',
            '', '',                               // descripciones extra
            '',                                   // cuotas
            detail,                               // detalle de otra forma de pago (código 99)
            '',                                   // detalle de cupones
            String(code).padStart(2, '0'),        // código de forma de pago
            scaled(amount),                       // monto 10,2
        ].join('|'));
    }

    // Cerrar: bit 0 = cortar papel, bit 1 = devolver respuesta electrónica
    // (sin este bit el equipo NO informa el número del tique). 7 campos vacíos.
    cmds.push(`${CMD.TICKET_CLOSE}|0003|||||||`);
    return cmds;
}

module.exports = {
    CMD,
    DOC_TYPE,
    decodeFiscalStatus,
    decodePrinterStatus,
    buildTicketCommands,
    text,
    quantity,
    ivaRate,
    paymentFields,
};
