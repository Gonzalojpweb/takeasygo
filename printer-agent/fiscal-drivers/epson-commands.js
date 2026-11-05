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
    FISCAL_DATA: '0507',     // 6.4.5 Obtener Datos de Fiscalización
    Z_REPORT: '0801',        // 6.6.1 Informe Diario de Cierre (Cierre Z)
    X_REPORT: '0802',        // 6.6.2 Informe «Salida de Cajero»
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

// ── Clases de documento ─────────────────────────────────────────────────────
// La LETRA del Tique Factura la decide el equipo según emisor y comprador (y
// la devuelve al cerrar): por eso se miran los contadores de todas las letras.
const DOCUMENT_CLASSES = {
    tique: { prefix: '0A', openExt: '0000', itemExt: '0000', closeFields: 7, counters: { 83: 'TIQUE' }, numberField: 0, totalField: 1 },
    tique_nc: { prefix: '0A', openExt: '4000', itemExt: '0000', closeFields: 7, counters: { 110: 'TIQUE NOTA DE CREDITO' }, numberField: 0, totalField: 1 },
    factura: {
        prefix: '0B', openExt: '0000', itemExt: '4000', closeFields: 6,
        counters: { 81: 'TIQUE FACTURA A', 82: 'TIQUE FACTURA B', 111: 'TIQUE FACTURA C' }, numberField: 0, letterField: 1, totalField: 2,
    },
    nota_credito: {
        prefix: '0D', openExt: '0000', itemExt: '4000', closeFields: 7,
        counters: { 112: 'TIQUE NOTA DE CREDITO A', 113: 'TIQUE NOTA DE CREDITO B', 114: 'TIQUE NOTA DE CREDITO C' }, numberField: 0, letterField: 1, totalField: 2,
    },
};

/** Código «ddd» del comprobante de origen (formato ddd-ppppp-nnnnnnnn). */
const ORIGIN_CODES = {
    TIQUE: '083',
    'TIQUE FACTURA A': '081',
    'TIQUE FACTURA B': '082',
    'TIQUE FACTURA C': '111',
};

/** Cancelar según el documento en progreso (bits 3-0 del estado fiscal). */
const CANCEL_BY_IN_PROGRESS = { 1: '0A07', 2: '0B07', 3: '0D07', 4: '0B07' };

/** ¿Tique o Tique Factura? Consumidor final sin identificar ⇒ Tique. */
function documentClassFor(receiver, kind) {
    const r = receiver || {};
    const anonymous = !r.condition || (r.condition === 'consumidor_final' && (!r.docType || r.docType === 99));
    if (kind === 'credit_note') return anonymous ? 'tique_nc' : 'nota_credito';
    return anonymous ? 'tique' : 'factura';
}

/** Responsabilidad ante el IVA del comprador (0B 01 / 0D 01, campo 8). */
const BUYER_RESPONSIBILITY = {
    responsable_inscripto: 'I',
    monotributo: 'M',
    exento: 'E',
    no_categorizado: 'U',
    consumidor_final: 'F',
};

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

/**
 * Reparte un descuento entre los ítems en proporción a su importe (resto mayor:
 * la suma da exacto). En Tique Factura/NC se manda dentro del precio: el
 * descuento global (0B 04) en clase A se interpreta sobre montos netos y el
 * sistema trabaja con importes con IVA.
 */
function prorateDiscount(lines, discountCents) {
    const totals = lines.map((l) => Number(l.totalCents) || 0);
    const sum = totals.reduce((a, b) => a + b, 0);
    if (discountCents <= 0 || sum <= 0) return totals;
    const raw = totals.map((t) => (t * discountCents) / sum);
    const floors = raw.map(Math.floor);
    let rest = discountCents - floors.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
        if (rest <= 0) break;
        floors[i]++;
        rest--;
    }
    return totals.map((t, i) => t - floors[i]);
}

function paymentFields(method) {
    const code = PAYMENT_CODES[method];
    if (code) return { code, detail: '' };
    const label = method === 'mercadopago' ? 'Mercado Pago' : method === 'kripton' ? 'Kripton' : String(method || 'Otro');
    return { code: 99, detail: text(label, 30) };   // 99 - Otros medios de pago
}

/** Línea de apertura de Tique Factura / NC: 12 campos (6.9.1 y 6.10.1). */
function openDocumentCommand(cls, klass, payload, origin) {
    const r = payload.receiver || {};
    const docNumber = String(r.docNumber || '').replace(/\D/g, '');
    const anonymous = !docNumber || docNumber === '0';
    const docLetter = anonymous ? '' : r.docType === 80 ? 'T' : r.docType === 86 ? 'L' : 'D';
    const name = text(r.name, 40) || (anonymous ? 'Consumidor Final' : `Documento ${docNumber}`);
    return [
        `${cls.prefix}01`, cls.openExt,
        name, '',                                        // 1-2 nombre del comprador
        // 3-5 domicilio: obligatorio salvo consumidor final. El POS no lo pide todavía.
        text(r.address, 40) || (r.condition === 'consumidor_final' ? '' : 'No informado'), '', '',
        docLetter,                                       // 6 tipo de documento (T = CUIT, D = DNI)
        anonymous ? '' : docNumber,                      // 7 número de documento
        BUYER_RESPONSIBILITY[r.condition] || 'F',        // 8 responsabilidad ante el IVA
        '', '', '',                                      // 9-11 documentos asociados
        klass === 'nota_credito' ? origin : '',          // 12 comprobante de origen (0D) / turista (0B, vacío)
    ].join('|');
}

/** «ddd-ppppp-nnnnnnnn», o vacío si no se conoce. */
function originLine(origin, fallbackPointOfSale) {
    if (!origin || !origin.number) return '';
    const code = ORIGIN_CODES[origin.documentType];
    const pos = origin.pointOfSale || fallbackPointOfSale;
    if (!code || !pos) return '';
    return `${code}-${String(pos).padStart(5, '0')}-${String(origin.number).padStart(8, '0')}`;
}

/**
 * Comandos de un documento, en orden.
 * payload = { receiver, lines:[{description, quantity, totalCents, ivaRate}],
 *             discountCents, payments:[{method, amountCents}], issuerIvaCondition,
 *             origin? }  ·  options = { kind: 'invoice'|'credit_note', pointOfSale? }
 */
function buildDocumentCommands(payload, options = {}) {
    const lines = (payload && payload.lines) || [];
    if (lines.length === 0) throw new Error('La venta no tiene ítems');
    const noIva = payload.issuerIvaCondition && payload.issuerIvaCondition !== 'responsable_inscripto';
    const klass = documentClassFor(payload.receiver, options.kind || 'invoice');
    const cls = DOCUMENT_CLASSES[klass];
    const origin = originLine(payload.origin, options.pointOfSale);
    const discount = Number(payload.discountCents) || 0;
    const insidePrice = cls.prefix !== '0A';   // ver prorateDiscount
    const amounts = insidePrice ? prorateDiscount(lines, discount) : lines.map((l) => Number(l.totalCents));

    const cmds = [
        cls.prefix === '0A' ? `${cls.prefix}01|${cls.openExt}` : openDocumentCommand(cls, klass, payload, origin),
    ];
    lines.forEach((l, i) => {
        const qty = Number(l.quantity) > 0 ? Number(l.quantity) : 1;
        const total = amounts[i];
        if (!Number.isInteger(total) || total < 0) throw new Error(`Importe inválido en «${l.description}»`);
        // Precio unitario 7,4 con IVA incluido: total del ítem / cantidad. La
        // impresora multiplica y redondea a 2 decimales (6.8.2, notas).
        const unit4 = (total * 100) / qty;
        const rate = noIva ? 0 : Number(l.ivaRate) || 0;
        const ivaCondition = noIva ? 0 : rate > 0 ? 7 : 2;   // 7 gravado · 2 exento · 0 no corresponde
        cmds.push([
            `${cls.prefix}02`, cls.itemExt,       // 0B/0D: bit 14 = montos brutos (con IVA)
            // El tique NC no tiene campo de origen: va como descripción del 1.er ítem.
            i === 0 && klass === 'tique_nc' && origin ? text(`Anula ${origin}`, 40) : '', '', '', '',
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

    if (discount > 0 && !insidePrice) {
        // Descuento GLOBAL: tasa de IVA vacía (6.8.4, requerimientos).
        cmds.push([`${cls.prefix}04`, '0000', 'Descuento', scaled(discount), '', 'DTO', ''].join('|'));
    }

    for (const p of payload.payments || []) {
        const amount = Number(p.amountCents) || 0;
        if (amount <= 0) continue;
        const { code, detail } = paymentFields(p.method);
        cmds.push([
            `${cls.prefix}05`, '0000',
            '', '',                               // descripciones extra
            '',                                   // cuotas
            detail,                               // detalle de otra forma de pago (código 99)
            '',                                   // detalle de cupones
            String(code).padStart(2, '0'),        // código de forma de pago
            scaled(amount),                       // monto 10,2
        ].join('|'));
    }

    // Cerrar: bit 0 = cortar papel, bit 1 = devolver respuesta electrónica
    // (sin este bit el equipo NO informa el número). Campos opcionales vacíos.
    cmds.push(`${cls.prefix}06|0003${'|'.repeat(cls.closeFields)}`);
    return cmds;
}

/** Compatibilidad: tique a consumidor final. */
function buildTicketCommands(payload) {
    return buildDocumentCommands(payload, { kind: 'invoice' });
}

/**
 * Informes, con las extensiones del ejemplo oficial (cmd_templates):
 * Z 0000 · X 0C01 (bit 0 imprime, bits 10-11 encabezados y establecimiento).
 */
/**
 * Reportes que guarda el equipo (6.7.1). Extensión: bits 1-2 del tipo. Archivos
 * firmados por el equipo, para que el local los presente con su contador.
 */
const FILE_REPORTS = {
    ctd: { ext: '0000', name: 'Cinta Testigo Digital' },
    duplicates: { ext: '0002', name: 'Duplicados de comprobantes A' },
    totals: { ext: '0004', name: 'Resumen de Totales' },
};

/** 2026-11-05 → 051126 (formato de fecha del equipo: ddmmyy). */
function deviceDate(isoDate) {
    const m = /^\d{2}(\d{2})-(\d{2})-(\d{2})$/.exec(String(isoDate));
    if (!m) throw new Error(`Fecha inválida: ${isoDate}`);
    return `${m[3]}${m[2]}${m[1]}`;
}

function buildFileReportDownload(payload) {
    const report = FILE_REPORTS[payload && payload.report];
    if (!report) throw new Error('Reporte desconocido');
    return {
        start: `0951|${report.ext}|${deviceDate(payload.from)}|${deviceDate(payload.to)}`,
        next: '0970|0000',
        end: '0971|0000',
        cancel: '0972|0000',
    };
}

function buildReportCommand(kind) {
    if (kind === 'z') return `${CMD.Z_REPORT}|0000`;
    if (kind === 'x') return `${CMD.X_REPORT}|0C01`;
    throw new Error(`Informe desconocido: ${kind}`);
}

module.exports = {
    CMD,
    DOCUMENT_CLASSES,
    CANCEL_BY_IN_PROGRESS,
    documentClassFor,
    buildDocumentCommands,
    prorateDiscount,
    originLine,
    buildReportCommand,
    FILE_REPORTS,
    deviceDate,
    buildFileReportDownload,
    DOC_TYPE,
    decodeFiscalStatus,
    decodePrinterStatus,
    buildTicketCommands,
    text,
    quantity,
    ivaRate,
    paymentFields,
};
