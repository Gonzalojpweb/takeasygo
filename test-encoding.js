const { encodeText, codepageCommand } = require('./apps/saas/lib/printing/.js/encoding')
const { TicketBuilder, SIZE_PRESETS, sizeCommand } = require('./apps/saas/lib/printing/.js/escpos-builder')

let pass = 0
let fail = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++ } else {
    fail++
    console.log(`  FAIL: ${label}`)
    console.log(`    expected: ${JSON.stringify(expected)}`)
    console.log(`    actual:   ${JSON.stringify(actual)}`)
  }
}

function checkNot(label, actual, forbidden) {
  const bad = JSON.stringify(actual) === JSON.stringify(forbidden)
  if (!bad) { pass++ } else {
    fail++
    console.log(`  FAIL: ${label} — got forbidden value ${JSON.stringify(forbidden)}`)
  }
}

// ── 1. CP437 encoding — Spanish alphabet ──────────────────────────────
console.log('─ Test 1: Spanish alphabet CP437 ─')

const spanish = 'áéíóúñÑüÜ¿¡'
const encoded = encodeText(spanish, 'cp437')
check('all Spanish chars encode', encoded.length, spanish.length)
// No byte should be 0x3F (?) for these
const hasQuestionMark = Array.from(encoded).some(b => b === 0x3f)
check('no ? in Spanish encoding', hasQuestionMark, false)

// ── 2. Uppercase accented — NFD stripping ─────────────────────────────
console.log('─ Test 2: Uppercase accented (NFD strip) ─')

// CP437 HAS É (0x90) but NOT Á Í Ó Ú in uppercase — those get NFD-stripped
const upperAccented = 'ÁÉÍÓÚ'
const encUpper = encodeText(upperAccented, 'cp437')
const upperHex = Array.from(encUpper).map(b => b.toString(16).padStart(2, '0')).join(' ')
console.log(`  ÁÉÍÓÚ encoded: ${upperHex}`)
// Expected: 41(A) 90(É kept) 49(I) 4F(O) 55(U) = 5 bytes
check('ÁÉÍÓÚ → 5 bytes', encUpper.length, 5)
check('Á→A (stripped)', encUpper[0], 0x41)
check('É kept as 0x90 (CP437 has it)', encUpper[1], 0x90)
check('Í→I (stripped)', encUpper[2], 0x49)
check('Ó→O (stripped)', encUpper[3], 0x4f)
check('Ú→U (stripped)', encUpper[4], 0x55)

// ── 3. Non-Spanish characters — fallback doesn't crash ─────────────────
console.log('─ Test 3: Non-Spanish fallback ─')

// ł (Polish l-stroke) — not in CP437, not decomposable to base+diacritic in NFD
const encLstroke = encodeText('ł', 'cp437')
check('ł does not crash', encLstroke.length >= 1, true)

// Emoji — should not crash
const encEmoji = encodeText('🍕', 'cp437')
check('emoji does not crash', encEmoji.length >= 0, true)

// Mixed string with emoji
const mixed = 'Cachapa 🍕 con Queso'
const encMixed = encodeText(mixed, 'cp437')
check('mixed string does not crash', encMixed.length > 0, true)

// ── 4. Punctuation replacements ───────────────────────────────────────
console.log('─ Test 4: Punctuation ─')

const smart = '\u201chello\u201d \u2018world\u2019 \u2014 dash \u2026 end'
const encSmart = encodeText(smart, 'cp437')
const smartStr = require('iconv-lite').decode(encSmart, 'cp437')
check('smart quotes → ASCII', smartStr.includes('"hello"'), true)
check('smart single quotes → ASCII', smartStr.includes("'world'"), true)
check('em dash → hyphen', smartStr.includes('- dash'), true)
check('ellipsis → ...', smartStr.includes('... end'), true)

// ── 5. Size presets — GS ! bytes ──────────────────────────────────────
console.log('─ Test 5: Size preset bytes ─')

const cases = [
  { name: 'normal', expected: [0x1d, 0x21, 0x00] },
  { name: 'large',  expected: [0x1d, 0x21, 0x11] },
  { name: 'double', expected: [0x1d, 0x21, 0x12] },
  { name: 'triple', expected: [0x1d, 0x21, 0x13] },
]

for (const c of cases) {
  const preset = SIZE_PRESETS[c.name]
  const cmd = sizeCommand(preset.width, preset.height)
  check(`size ${c.name} → GS! ${c.expected.map(b => '0x' + b.toString(16)).join(' ')}`,
    Array.from(cmd), c.expected)
}

// ── 6. Builder — bodySize inheritance ─────────────────────────────────
console.log('─ Test 6: Builder bodySize inheritance ─')

// Builder with fontSize 'large' — text without explicit size should use large
const t1 = new TicketBuilder({ paperWidth: 576, fontSize: 'large' })
check('bodySize = large', t1.bodySize, 'large')
check('width = 24 (2x on 80mm)', t1.width, 24)

const t2 = new TicketBuilder({ paperWidth: 576, fontSize: 'normal' })
check('bodySize = normal', t2.bodySize, 'normal')
check('width = 48 (1x on 80mm)', t2.width, 48)

// ── 7. Builder — lineSpacingDots ──────────────────────────────────────
console.log('─ Test 7: lineSpacingDots ─')

const t3 = new TicketBuilder({ paperWidth: 576, lineSpacingDots: 48 })
const buf3 = t3.toBuffer()
// Should contain ESC 3 48 = 0x1b 0x33 0x30
const hasLineSpacing = buf3.includes(Buffer.from([0x1b, 0x33, 0x30]))
check('ESC 3 48 present when lineSpacingDots=48', hasLineSpacing, true)

const t4 = new TicketBuilder({ paperWidth: 576 })
const buf4 = t4.toBuffer()
const hasNoLineSpacing = !buf4.includes(Buffer.from([0x1b, 0x33]))
check('no ESC 3 when lineSpacingDots undefined', hasNoLineSpacing, true)

// ── 8. Builder — CUT command ──────────────────────────────────────────
console.log('─ Test 8: CUT command ─')

const t5 = new TicketBuilder({ paperWidth: 576 })
t5.cut()
const buf5 = t5.toBuffer()
const hasCut = buf5.includes(Buffer.from([0x1d, 0x56, 0x01]))
check('CUT = GS V 1 (3 bytes)', hasCut, true)
const hasCut4byte = buf4.includes(Buffer.from([0x1d, 0x56, 0x42, 0x00]))
check('no GS V B NUL (4 bytes)', hasCut4byte, false)

// ── 9. Builder — header always overrides bodySize ─────────────────────
console.log('─ Test 9: explicit size override ─')

const t6 = new TicketBuilder({ paperWidth: 576, fontSize: 'normal' })
t6.text('HEADER', { size: 'triple', bold: true, align: 'center' })
t6.text('body line') // should use normal (bodySize)
const buf6 = t6.toBuffer()
// Should contain GS ! 0x13 (triple) for header
const hasTriple = buf6.includes(Buffer.from([0x1d, 0x21, 0x13]))
check('header uses triple (0x13)', hasTriple, true)
// Should contain GS ! 0x00 (normal reset) after header
const hasNormalReset = buf6.includes(Buffer.from([0x1d, 0x21, 0x00]))
check('resets to normal after header', hasNormalReset, true)

// ── Summary ───────────────────────────────────────────────────────────
console.log('')
console.log('='.repeat(50))
console.log(`Results: ${pass} pass, ${fail} fail, ${pass + fail} total`)
console.log('='.repeat(50))
process.exit(fail > 0 ? 1 : 0)
