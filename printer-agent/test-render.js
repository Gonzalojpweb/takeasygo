const iconv = require('iconv-lite')

// ── ESC/POS Commands ──────────────────────────────────────────────
const ESC = {
  INIT: Buffer.from([0x1b, 0x40]),
  CODE_PAGE: Buffer.from([0x1b, 0x74, 0x00]), // CP437
  ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([0x1b, 0x61, 0x02]),
  BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
  UNDERLINE_ON: Buffer.from([0x1b, 0x2d, 0x01]),
  UNDERLINE_OFF: Buffer.from([0x1b, 0x2d, 0x00]),
  FEED_LINE: Buffer.from([0x0a]),
  FEED_LINES: (n) => Buffer.from(Array(n).fill(0x0a)),
  CUT: Buffer.from([0x1d, 0x56, 0x42, 0x00]),
  SET_FONT_SIZE: (h, w) => Buffer.from([0x1d, 0x21, (h << 4) | w]),
}

const cols = 48 // 80mm

function buf(text) { return iconv.encode(text, 'cp437') }
function line(char = '-') { return buf(char.repeat(cols) + '\n') }
function pad(text, width) {
  const visible = text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
  const padLen = Math.max(0, width - [...visible].length)
  return text + ' '.repeat(padLen)
}
function money(n) { return n.toLocaleString('es-AR') }

// ── Sample Order ──────────────────────────────────────────────────
const order = {
  orderNumber: 'QT-1042',
  createdAt: new Date('2026-09-23T20:30:00'),
  status: 'awaiting_confirmation',
  orderMode: 'takeaway',
  total: 52800,
  notes: 'Sin cebolla en la cachapa',
  payment: { method: 'transfer' },
  customer: { name: 'María González', phone: '+54 9 11 5555-1234' },
  items: [
    {
      name: 'Cachapa con Queso',
      quantity: 2,
      price: 18000,
      subtotal: 36000,
      category: 'CACHAPAS',
      customizations: [
        {
          groupName: 'Queso',
          selectedOptions: [{ name: 'Queso Blanco' }]
        },
        {
          groupName: 'Adicionales',
          selectedOptions: [
            { name: 'Jamón crudo', price: 3000 },
            { name: 'Palta', price: 2500 },
          ]
        }
      ],
      shortDescription: 'Cachapa tradicional con queso blanco'
    },
    {
      name: 'Papelón con Limón',
      quantity: 1,
      price: 8000,
      subtotal: 8000,
      category: 'BEBIDAS',
      customizations: []
    },
    {
      name: 'Combo Para Dos - Salto Ángel',
      quantity: 1,
      price: 47800,
      subtotal: 47800,
      category: 'COMBOS PARA DOS',
      isPromo: true,
      customizations: [
        {
          groupName: 'Cachapa 1 - Queso',
          selectedOptions: [{ name: 'Queso Blanco' }]
        },
        {
          groupName: 'Cachapa 2 - Queso',
          selectedOptions: [{ name: "Queso Cura'o" }]
        },
        {
          groupName: 'Bebida 1',
          selectedOptions: [{ name: 'Coca Cola' }]
        },
        {
          groupName: 'Bebida 2',
          selectedOptions: [{ name: 'Papelón con Limón' }]
        }
      ],
      shortDescription: '2 cachapas + 2 bebidas'
    }
  ]
}

// ── Render ────────────────────────────────────────────────────────
const chunks = []

// Header
chunks.push(ESC.INIT, ESC.CODE_PAGE, ESC.ALIGN_CENTER, ESC.BOLD_ON, ESC.SET_FONT_SIZE(1, 1))
chunks.push(buf('================================\n'))
chunks.push(buf('   QUE CACHAPA - CABALLITO\n'))
chunks.push(buf('   Takeaway / Para Llevar\n'))
chunks.push(buf('================================\n\n'))
chunks.push(ESC.BOLD_OFF, ESC.ALIGN_LEFT)

// Order info
chunks.push(ESC.BOLD_ON)
chunks.push(buf(`PEDIDO #${order.orderNumber}\n`))
chunks.push(ESC.BOLD_OFF)
chunks.push(line())
chunks.push(buf(`Cliente:  ${order.customer.name}\n`))
chunks.push(buf(`Telefono: ${order.customer.phone}\n`))
chunks.push(buf(`Hora:     ${order.createdAt.toLocaleTimeString('es-AR')}\n`))
chunks.push(buf(`Metodo:   Transferencia\n`))
chunks.push(buf(`Modo:     ${order.orderMode}\n`))
chunks.push(line())

// Items grouped by category
const categories = [...new Set(order.items.map(i => i.category))]
for (const cat of categories) {
  chunks.push(ESC.BOLD_ON, ESC.ALIGN_CENTER)
  chunks.push(buf(`--- ${cat} ---\n`))
  chunks.push(ESC.BOLD_OFF, ESC.ALIGN_LEFT)

  for (const item of order.items.filter(i => i.category === cat)) {
    chunks.push(ESC.BOLD_ON)
    const itemLine = `${item.quantity}x ${item.name}`
    chunks.push(buf(pad(itemLine, cols - 8) + `$${money(item.subtotal)}\n`))
    chunks.push(ESC.BOLD_OFF)

    if (item.shortDescription) {
      chunks.push(buf(`   ${item.shortDescription}\n`))
    }

    for (const g of item.customizations) {
      chunks.push(buf(`   > ${g.groupName}:\n`))
      for (const opt of g.selectedOptions) {
        const extra = opt.price ? ` (+$${money(opt.price)})` : ''
        chunks.push(buf(`     - ${opt.name}${extra}\n`))
      }
    }
  }
  chunks.push(buf('\n'))
}

// Notes
if (order.notes) {
  chunks.push(line())
  chunks.push(ESC.BOLD_ON)
  chunks.push(buf('NOTAS:\n'))
  chunks.push(ESC.BOLD_OFF)
  chunks.push(buf(`  ${order.notes}\n`))
}

// Total
chunks.push(line('='))
chunks.push(ESC.BOLD_ON, ESC.ALIGN_RIGHT, ESC.SET_FONT_SIZE(1, 1))
chunks.push(buf(`TOTAL: $${money(order.total)}\n`))
chunks.push(ESC.BOLD_OFF, ESC.ALIGN_LEFT)

// Footer
chunks.push(line())
chunks.push(ESC.ALIGN_CENTER)
chunks.push(buf('Gracias por tu pedido!\n'))
chunks.push(buf('Que Cachapa - Caballito\n'))
chunks.push(line())
chunks.push(ESC.FEED_LINES(4), ESC.CUT)

const ticket = Buffer.concat(chunks)

// ── Output ────────────────────────────────────────────────────────
console.log('='.repeat(50))
console.log(' TICKET RENDERED — CP437')
console.log('='.repeat(50))
console.log('')

// Print as text (decode the text parts)
const text = iconv.decode(ticket, 'cp437')
console.log(text)

console.log('')
console.log('='.repeat(50))
console.log(` Buffer size: ${ticket.length} bytes`)
console.log(` First bytes: ${ticket.slice(0, 20).toString('hex')}`)
console.log(` Has ESC @ (INIT): ${ticket.includes(Buffer.from([0x1b, 0x40]))}`)
console.log(` Has ESC t 0 (CP437): ${ticket.includes(Buffer.from([0x1b, 0x74, 0x00]))}`)
console.log(` Has GS V B (CUT): ${ticket.includes(Buffer.from([0x1d, 0x56, 0x42]))}`)
console.log('='.repeat(50))

// Also save as binary for inspection
require('fs').writeFileSync('sample-ticket.bin', ticket)
console.log('\nSaved: sample-ticket.bin')
