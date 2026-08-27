/**
 * ticket-renderer.js
 * Renderiza tickets completos a canvas RGBA usando @napi-rs/canvas.
 * Fuente: Consolas. Soporta 58mm (384 dots) y 80mm (576 dots).
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

// ── Registro de fuente ──
const FONT_CANDIDATES = [
    'C:\\Windows\\Fonts\\consola.ttf',
    'C:\\Windows\\Fonts\\cour.ttf',
    'C:\\Windows\\Fonts\\lucon.ttf',
];

let fontRegistered = false;
for (const fontPath of FONT_CANDIDATES) {
    if (fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, 'TicketMono');
        fontRegistered = true;
        break;
    }
}
if (!fontRegistered) {
    GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\consola.ttf', 'TicketMono');
}

const FONT = 'TicketMono';

// ── Configuración por paper width ──
const PAPER_CONFIG = {
    384: { // 58mm
        width: 384,
        marginX: 16,
        fontSize: {
            restaurantName: 22,
            orderHeader: 20,
            sectorLabel: 14,
            info: 14,
            categoryHeader: 13,
            promoHeader: 18,
            itemName: 16,
            customization: 12,
            separator: 12,
            footer: 12,
            total: 18,
        },
    },
    576: { // 80mm
        width: 576,
        marginX: 24,
        fontSize: {
            restaurantName: 28,
            orderHeader: 24,
            sectorLabel: 16,
            info: 16,
            categoryHeader: 15,
            promoHeader: 22,
            itemName: 18,
            customization: 14,
            separator: 14,
            footer: 14,
            total: 22,
        },
    },
};

// ── Helpers de canvas ──

function drawLine(ctx, y, marginX, width, color = '#000000') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX, y);
    ctx.lineTo(width - marginX, y);
    ctx.stroke();
    return y + 4;
}

function drawText(ctx, text, x, y, { font, color = '#000000', align = 'left', maxWidth } = {}) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y, maxWidth);
}

function wrapText(ctx, text, font, maxWidth) {
    ctx.font = font;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
}

function formatMoney(v) {
    return Number(v || 0).toLocaleString('es-AR');
}

function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleString('es-AR');
}

// ── Clase principal ──

class TicketRenderer {
    constructor(paperWidth, settings, role) {
        const config = PAPER_CONFIG[paperWidth] || PAPER_CONFIG[384];
        this.paperWidth = config.width;
        this.marginX = config.marginX;
        this.usableWidth = config.width - config.marginX * 2;
        this.fontSize = config.fontSize;
        this.settings = settings || {};
        this.role = role;

        // Estado del renderizado
        this.lines = []; // Array de { text, font, align, bold, indent }
        this.currentY = 0;
    }

    font(size, bold = false) {
        return `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    }

    addLine(text, size, { bold = false, align = 'left', indent = 0 } = {}) {
        this.lines.push({
            text,
            font: this.font(size, bold),
            align,
            indent,
            size,
        });
    }

    addSeparator() {
        this.lines.push({ type: 'separator' });
    }

    addSpacer(pixels = 8) {
        this.lines.push({ type: 'spacer', height: pixels });
    }

    // ── Renderizado de secciones ──

    renderHeader(order) {
        const ctx = createCanvas(1, 1).getContext('2d');
        const locationName = order.location?.locationName?.toUpperCase() || 'MI NEGOCIO';

        if (this.role === 'cashier') {
            this.addLine(locationName, this.fontSize.restaurantName, { bold: true, align: 'center' });
            this.addLine('TICKET DE PAGO', this.fontSize.info, { align: 'center' });
        } else {
            this.addLine(`ORDEN: ${order.orderNumber}`, this.fontSize.orderHeader, { bold: true, align: 'center' });
            const sectorLabel = this.role === 'bar' ? 'BARRA / BEBIDAS' : 'COCINA';
            this.addLine(`*** ${sectorLabel} ***`, this.fontSize.sectorLabel, { align: 'center' });
        }

        this.addSeparator();
    }

    renderOrderInfo(order) {
        this.addLine(`Fecha: ${formatDateTime(order.createdAt)}`, this.fontSize.info);

        if (order.orderMode) {
            const modeLabel = order.orderMode === 'takeaway' ? 'PARA LLEVAR' : 'DELIVERY';
            this.addLine(`Tipo: ${modeLabel}`, this.fontSize.info);
        }

        // Pago en efectivo
        if (order.payment?.method === 'cash') {
            this.addLine('=== PAGO EFECTIVO ===', this.fontSize.info, { bold: true, align: 'center' });
        }

        // Dirección de delivery
        if (order.orderMode === 'delivery' && order.deliveryAddress) {
            const addr = order.deliveryAddress;
            let addrLine = `Dir: ${addr.street} ${addr.number}`;
            if (addr.apt) addrLine += ` (${addr.apt})`;
            this.addLine(addrLine, this.fontSize.info, { bold: true });
            this.addLine(addr.city, this.fontSize.info);
        }

        if (order.orderTiming === 'scheduled' && order.scheduledPickupAt) {
            const schedDate = new Date(order.scheduledPickupAt);
            const time = schedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const date = schedDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
            this.addLine(`PROGRAMADO: ${date} ${time} hs`, this.fontSize.info, { bold: true });
        }

        if (this.settings.showCustomerInfo) {
            const customer = order.customer || {};
            if (customer.name) {
                this.addLine(`Cliente: ${customer.name.toUpperCase()}`, this.fontSize.info, { bold: true });
            }
            if (customer.phone) {
                this.addLine(`Tel: ${customer.phone}`, this.fontSize.info);
            }
        }

        if (this.settings.showOrderNotes && order.notes) {
            this.addSeparator();
            this.addLine(`OBS: ${order.notes.toUpperCase()}`, this.fontSize.info, { bold: true });
        }

        this.addSeparator();
    }

    renderCustomizations(customizations, indentLevel = 1) {
        if (!customizations || customizations.length === 0) return;

        const indent = '  '.repeat(indentLevel);

        for (const c of customizations) {
            const group = c.groupName || '';
            const sels = Array.isArray(c.selectedOptions)
                ? c.selectedOptions.map(o => o.name?.toUpperCase()).filter(Boolean)
                : [];

            if (sels.length > 0) {
                const prefix = group ? `${group.toUpperCase()}: ` : '';
                this.addLine(`${indent}> ${prefix}${sels.join(', ')}`, this.fontSize.customization);
            }

            // Sub-grupos (subGroups anidados)
            if (Array.isArray(c.selectedOptions)) {
                for (const opt of c.selectedOptions) {
                    if (Array.isArray(opt.subGroups) && opt.subGroups.length > 0) {
                        this.renderCustomizations(opt.subGroups, indentLevel + 2);
                    }
                }
            }
        }
    }

    renderHalfAndHalf(item, indentLevel = 1) {
        const indent = '  '.repeat(indentLevel);
        const halfFirst = (item.customizations || []).find(c => /primera mitad/i.test(c.groupName));
        const halfSecond = (item.customizations || []).find(c => /segunda mitad/i.test(c.groupName));

        if (!halfFirst && !halfSecond) return false;

        this.addLine(`${indent}=== MITAD Y MITAD ===`, this.fontSize.customization);

        if (halfFirst) {
            const opt = halfFirst.selectedOptions?.[0]?.name || '';
            this.addLine(`${indent}  1ra mitad: ${opt.toUpperCase()}`, this.fontSize.customization);
        }
        if (halfSecond) {
            const opt = halfSecond.selectedOptions?.[0]?.name || '';
            this.addLine(`${indent}  2da mitad: ${opt.toUpperCase()}`, this.fontSize.customization);
        }

        // Otras customizaciones que no son mitad y mitad
        const otherCustomizations = (item.customizations || []).filter(c =>
            !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
        );
        if (otherCustomizations.length > 0) {
            this.renderCustomizations(otherCustomizations, indentLevel + 1);
        }

        return true;
    }

    renderItem(item, isSubItem = false) {
        const indentLevel = isSubItem ? 2 : 1;
        const indent = '  '.repeat(indentLevel);

        if (item.itemType === 'reward') {
            this.addLine('[RECOMPENSA]', this.fontSize.categoryHeader, { bold: true, align: 'center' });
        }

        const displayName = item.name.toUpperCase();
        const line = `${item.quantity}x ${displayName}`;

        if (this.settings.showPrices && this.role === 'cashier') {
            const price = `$${formatMoney(item.price * item.quantity)}`;
            // Alinear precio a la derecha con dots
            const dotsCount = Math.max(2, 30 - line.length - price.length);
            const dots = '.'.repeat(dotsCount);
            this.addLine(`${line}${dots}${price}`, this.fontSize.itemName, { bold: true });
        } else {
            this.addLine(line, this.fontSize.itemName, { bold: true });
        }

        if (this.settings.showDescriptions && item.description && !isSubItem) {
            const desc = item.description.toUpperCase();
            this.addLine(`${indent}${desc}`, this.fontSize.customization);
        }

        if (item.selectedVariant) {
            this.addLine(`${indent}> Variante: ${item.selectedVariant.name.toUpperCase()}`, this.fontSize.customization);
        }

        // Mitad y mitad
        const hasHalf = this.renderHalfAndHalf(item, indentLevel);
        if (!hasHalf) {
            this.renderCustomizations(item.customizations, indentLevel);
        }
    }

    renderPromoGroup(group) {
        const promoTitle = group.promotionTitle.toUpperCase();
        const totalQty = group.totalQuantity;

        if (this.settings.showCategory) {
            // Reset category tracking
        }

        if (this.settings.showPrices && this.role === 'cashier') {
            const headerLine = `${totalQty}x ${promoTitle}`;
            const totalPrice = group.items.reduce((s, i) => s + i.price * i.quantity, 0);
            const headerPrice = `$${formatMoney(totalPrice)}`;
            const dotsCount = Math.max(2, 30 - headerLine.length - headerPrice.length);
            const dots = '.'.repeat(dotsCount);
            this.addLine(`${headerLine}${dots}${headerPrice}`, this.fontSize.promoHeader, { bold: true });
        } else {
            this.addLine(`${totalQty}x ${promoTitle}`, this.fontSize.promoHeader, { bold: true });
        }

        // Descripción corta
        if (this.settings.showDescriptions && group.items[0].shortDescription) {
            this.addLine(`  ${group.items[0].shortDescription.toUpperCase()}`, this.fontSize.customization);
        }

        // Items del combo
        for (const item of group.items) {
            const rawName = item.name.includes(' - ')
                ? item.name.substring(item.name.indexOf(' - ') + 3)
                : item.name;
            const itemName = rawName.toUpperCase();
            this.addLine(`  - ${item.quantity}x ${itemName}`, this.fontSize.itemName);

            if (item.selectedVariant) {
                this.addLine(`    > Variante: ${item.selectedVariant.name.toUpperCase()}`, this.fontSize.customization);
            }

            const hasHalf = this.renderHalfAndHalf(item, 2);
            if (!hasHalf) {
                this.renderCustomizations(item.customizations, 2);
            }
        }
    }

    renderPromoCode(order) {
        if (order.promoCode && order.promoCreatedBy === 'superadmin') {
            this.addLine(`[PROMO SUPERADMIN: ${order.promoCode.toUpperCase()}]`, this.fontSize.info, { bold: true, align: 'center' });
        } else if (order.discountAmount > 0 && order.promoSlug) {
            this.addLine(`[DESCUENTO PROMO: ${order.promoSlug.toUpperCase()}]`, this.fontSize.info, { align: 'center' });
        }
    }

    renderTotal(order) {
        if (this.settings.showTotal && this.role === 'cashier') {
            this.addSeparator();
            this.addLine(`TOTAL: $${formatMoney(order.total)}`, this.fontSize.total, { bold: true, align: 'right' });
        }
    }

    renderFooter() {
        if (this.settings.footerTemplate) {
            this.addLine(this.settings.footerTemplate, this.fontSize.footer, { align: 'center' });
        }
    }

    // ── Pipeline principal ──

    render(order) {
        // 1. Header
        this.renderHeader(order);

        // 2. Info del pedido
        this.renderOrderInfo(order);

        // 3. Items
        const allItems = order.items || [];
        let itemsToPrint = [];

        if (this.role === 'cashier') {
            itemsToPrint = allItems;
        } else if (this.role === 'kitchen') {
            itemsToPrint = allItems.filter(i => !i.printRole || i.printRole === 'kitchen' || i.printRole === 'both');
        } else if (this.role === 'bar') {
            itemsToPrint = allItems.filter(i => i.printRole === 'bar' || i.printRole === 'both');
        }

        if (itemsToPrint.length === 0) return null;

        // Agrupar promos consecutivas
        const groups = [];
        let currentGroup = null;

        for (const item of itemsToPrint) {
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
                    groups.push(currentGroup);
                }
            } else {
                currentGroup = null;
                groups.push({ single: item });
            }
        }

        // Renderizar cada grupo
        let lastCategory = null;

        for (const group of groups) {
            if (group.single) {
                const item = group.single;

                // Category header
                if (this.settings.showCategory) {
                    const currentCategory = (item.categoryName && item.itemType !== 'reward')
                        ? item.categoryName : null;
                    if (currentCategory && currentCategory !== lastCategory) {
                        this.addLine(`[${currentCategory.toUpperCase()}]`, this.fontSize.categoryHeader, { bold: true, align: 'center' });
                    }
                    lastCategory = currentCategory;
                }

                this.renderItem(item);
                this.addSpacer(10);
            } else {
                if (this.settings.showCategory) {
                    lastCategory = null;
                }
                this.renderPromoGroup(group);
                this.addSpacer(8);
            }
        }

        // 4. Promo code / descuento
        this.renderPromoCode(order);

        // 5. Total
        this.renderTotal(order);

        // 6. Footer
        this.renderFooter();

        // 7. Padding final
        this.addSpacer(40);

        // 8. Calcular altura y renderizar a canvas
        return this.renderToCanvas();
    }

    renderToCanvas() {
        const canvas = createCanvas(this.paperWidth, 10); // Altura temporal
        const ctx = canvas.getContext('2d');

        // Fondo blanco
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.paperWidth, 10);

        // Calcular altura total
        let totalHeight = 16; // Padding superior
        for (const line of this.lines) {
            if (line.type === 'separator') {
                totalHeight += 6;
            } else if (line.type === 'spacer') {
                totalHeight += line.height;
            } else {
                ctx.font = line.font;
                const metrics = ctx.measureText(line.text);
                const lineHeight = line.size * 1.4; // Interlineado
                totalHeight += lineHeight;
            }
        }
        totalHeight += 20; // Padding inferior

        // Re-crear canvas con altura final
        const finalCanvas = createCanvas(this.paperWidth, totalHeight);
        const fctx = finalCanvas.getContext('2d');

        // Fondo blanco
        fctx.fillStyle = '#FFFFFF';
        fctx.fillRect(0, 0, this.paperWidth, totalHeight);

        // Dibujar contenido
        let y = 16;

        for (const line of this.lines) {
            if (line.type === 'separator') {
                y = drawLine(fctx, y, this.marginX, this.paperWidth);
                y += 2;
            } else if (line.type === 'spacer') {
                y += line.height;
            } else {
                fctx.font = line.font;
                fctx.fillStyle = '#000000';
                fctx.textBaseline = 'top';

                let x = this.marginX;
                if (line.align === 'center') {
                    fctx.textAlign = 'center';
                    x = this.paperWidth / 2;
                } else if (line.align === 'right') {
                    fctx.textAlign = 'right';
                    x = this.paperWidth - this.marginX;
                } else {
                    fctx.textAlign = 'left';
                    // Indent
                    if (line.indent) {
                        x = this.marginX + line.indent * 12;
                    }
                }

                fctx.fillText(line.text, x, y);
                y += line.size * 1.4;
            }
        }

        return finalCanvas;
    }
}

/**
 * Renderiza el ticket completo a un canvas RGBA.
 * @param {Object} order - objeto order de MongoDB
 * @param {string} role - 'kitchen' | 'bar' | 'cashier'
 * @param {number} paperWidth - 384 (58mm) o 576 (80mm)
 * @param {Object} settings - printSettings del rol
 * @param {Object} options - { restaurantName, logoBase64? } (logo no implementado aún)
 * @returns {import('@napi-rs/canvas').Canvas|null}
 */
function renderTicketToCanvas(order, role, paperWidth, settings, options = {}) {
    const renderer = new TicketRenderer(paperWidth, settings, role);
    return renderer.render(order);
}

module.exports = { renderTicketToCanvas, TicketRenderer, PAPER_CONFIG };
