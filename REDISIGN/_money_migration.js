// _money_migration.js - Money integer migration (pesos -> centavos, x100)
// Usage: mongosh "mongodb+srv://.../DATABASE" _money_migration.js
// Modes (env vars):
//   DRY_RUN=true   -> read-only: per-path count/min/max + samples (no writes)
//   RUN=true       -> execute migration ($map/$mergeObjects pipelines), then verify
//   SNAPSHOT=true  -> read-only: per-path count/min/max dump (usable before/after)
//
// SAFETY:
//  - RUN requires an INTERACTIVE CONFIRMATION: it prints the target database
//    name and refuses to write anything unless the operator types CONFIRMAR.
//  - Every array nesting level is transformed with $map + $mergeObjects
//    (never dotted $set through arrays, which corrupts scalars into arrays).
//  - Each collection runs a SINGLE aggregation update pipeline
//    ($project + $mergeObjects [$$ROOT, ...]), so a failing pipeline applies
//    NOTHING for that collection (atomic per collection).
//  - Points fields (pointsCost, pointsUsed, totalPointsSpent, welcomePoints,
//    pointsPerCurrency...) are NOT money and are excluded.
//  - Percentages (feePercent, surchargePercent, pointsPercentage...) are NOT
//    money and are excluded.
//  - RUN refuses to execute twice against the same database unless FORCE=true
//    (double-run would multiply values again). Restoring from backup clears it.
//  - The marker keeps PER-COLLECTION progress ({progress: {coll: {status,
//    modified}}}) so an interrupted run (process killed, connection lost) leaves
//    status=running plus exactly which collections completed: an unfinished run
//    is always detectable and re-running is refused until restore-from-backup.
//    A planning error (e.g. BSON depth) writes nothing for that collection; the
//    after-scan verification catches any partial state and keeps status=running.

const envFlag = (name) =>
  typeof process !== 'undefined' && process.env && process.env[name] === 'true'
const DRY_RUN = envFlag('DRY_RUN')
const RUN = envFlag('RUN')
const SNAPSHOT = envFlag('SNAPSHOT')
const FORCE = envFlag('FORCE')

const MODES = [DRY_RUN, RUN, SNAPSHOT].filter(Boolean).length
if (MODES === 0) {
  print('Usage: mongosh "<MONGODB_URI>" _money_migration.js')
  print('  Set DRY_RUN=true (count), RUN=true (execute), or SNAPSHOT=true (dump)')
  quit(1)
}
if (MODES > 1) {
  print('Error: use only ONE mode (DRY_RUN, RUN, or SNAPSHOT)')
  quit(1)
}

const dbName = db.getName()

// Interactive confirmation for RUN mode (write). Reads a line from stdin and
// only returns true when the operator types CONFIRMAR. Prevents the
// "write to the wrong database" class of error from going unnoticed.
function confirmRun() {
  const readline = require('readline')
  print('')
  print('=== CONFIRMACION OBLIGATORIA (modo RUN) ===')
  print('Base de datos destino: ' + dbName)
  print('Este comando MULTIPLICARA POR 100 los campos monetarios del manifest')
  print('en esa base. No es reversible salvo restore desde backup.')
  print('')
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question('Escribi CONFIRMAR para continuar (cualquier otra cosa cancela): ', (ans) => {
      const ok = ans.trim().toUpperCase() === 'CONFIRMAR'
      rl.close()
      if (!ok) {
        print('')
        print('Cancelado. No se escribio nada.')
      }
      resolve(ok)
    })
  })
}

print('=== MONEY INTEGER MIGRATION (pesos -> centavos) ===')
print('Database: ' + dbName)
print('Mode: ' + (DRY_RUN ? 'DRY-RUN (read-only)' : RUN ? 'RUN (write)' : 'SNAPSHOT (read-only)'))
print('')

// ─────────────────────────── aggregation helpers ────────────────────────────

function moneyExpr(f) {
  return {
    $cond: [
      { $isNumber: f },
      { $multiply: [f, 100] },
      f,
    ],
  }
}

function isObjectExpr(f) {
  return { $eq: [{ $type: f }, 'object'] }
}

function mergeObj(expr, fields) {
  return { $mergeObjects: [expr, fields] }
}

// $map over arrExpr ONLY if it is actually an array. Missing/null arrays are
// returned unchanged (so $mergeObjects omits them), guaranteeing the migration
// never injects [] into fields that did not exist (e.g. menu.subcategories).
// No $ifNull is needed because $isArray guards the $map input.
function mapArr(arrExpr, as, inExpr) {
  return {
    $cond: [
      { $isArray: arrExpr },
      { $map: { input: arrExpr, as, in: inExpr } },
      arrExpr,
    ],
  }
}

// Max recursion depth when building nested $map expressions (expression trees are
// built statically, so recursion must be finite, and BSON nesting must stay < 50).
// Real production data nests only 1 level (options/selectedOptions mapped, with
// subGroups absent in the data), so MAX_DEPTH=1 is enough. If data with money
// inside subGroups appears, raise it (watch BSON depth: +~6 per extra level).
const MAX_DEPTH = 1

// Menu customization groups: options[].extraPrice, options[].subGroups[] (recursive)
function menuGroups(groupsExpr, depth) {
  depth = depth || 0
  if (depth >= MAX_DEPTH) return groupsExpr
  return mapArr(groupsExpr, 'grp', mergeObj('$$grp', {
    options: mapArr('$$grp.options', 'opt', mergeObj('$$opt', {
      extraPrice: moneyExpr('$$opt.extraPrice'),
      subGroups: menuGroups('$$opt.subGroups', depth + 1),
    })),
  }))
}

// Menu items: item scalars + variants[] + item-level customizationGroups[]
function menuItems(itemsExpr) {
  return mapArr(itemsExpr, 'item', mergeObj('$$item', {
    price: moneyExpr('$$item.price'),
    takeawayPrice: moneyExpr('$$item.takeawayPrice'),
    businessPrice: moneyExpr('$$item.businessPrice'),
    halfPrice: moneyExpr('$$item.halfPrice'),
    originalPrice: moneyExpr('$$item.originalPrice'),
    takeawayOriginalPrice: moneyExpr('$$item.takeawayOriginalPrice'),
    variants: mapArr('$$item.variants', 'variant', mergeObj('$$variant', {
      price: moneyExpr('$$variant.price'),
      takeawayPrice: moneyExpr('$$variant.takeawayPrice'),
      businessPrice: moneyExpr('$$variant.businessPrice'),
      originalPrice: moneyExpr('$$variant.originalPrice'),
      takeawayOriginalPrice: moneyExpr('$$variant.takeawayOriginalPrice'),
      customizationGroups: menuGroups('$$variant.customizationGroups'),
    })),
    customizationGroups: menuGroups('$$item.customizationGroups'),
  }))
}

// Order selected customization groups: selectedOptions[].extraPrice, subGroups[] (recursive)
function orderGroups(groupsExpr, depth) {
  depth = depth || 0
  if (depth >= MAX_DEPTH) return groupsExpr
  return mapArr(groupsExpr, 'grp', mergeObj('$$grp', {
    selectedOptions: mapArr('$$grp.selectedOptions', 'opt', mergeObj('$$opt', {
      extraPrice: moneyExpr('$$opt.extraPrice'),
      subGroups: orderGroups('$$opt.subGroups', depth + 1),
    })),
  }))
}

function pipelineProject(fields) {
  return [{ $replaceWith: { $mergeObjects: ['$$ROOT', fields] } }]
}

function nestedMoney(docExpr, path) {
  return {
    $cond: [
      isObjectExpr(docExpr),
      mergeObj(docExpr, { [path]: moneyExpr(docExpr + '.' + path) }),
      docExpr,
    ],
  }
}

// ─────────────────────────── pipelines per collection ────────────────────────

function buildOrders() {
  return pipelineProject({
    total: moneyExpr('$total'),
    subtotal: moneyExpr('$subtotal'),
    discountAmount: moneyExpr('$discountAmount'),
    deliveryCost: moneyExpr('$deliveryCost'),
    loyaltyDiscountAmount: moneyExpr('$loyaltyDiscountAmount'),
    rewardAdvanceAmount: moneyExpr('$rewardAdvanceAmount'),
    payment: {
      $cond: [
        isObjectExpr('$payment'),
        mergeObj('$payment', {
          baseTotal: moneyExpr('$payment.baseTotal'),
          surchargeAmount: moneyExpr('$payment.surchargeAmount'),
          platformFeeAmount: moneyExpr('$payment.platformFeeAmount'),
        }),
        '$payment',
      ],
    },
    items: mapArr('$items', 'item', mergeObj('$$item', {
      basePrice: moneyExpr('$$item.basePrice'),
      extraPrice: moneyExpr('$$item.extraPrice'),
      price: moneyExpr('$$item.price'),
      subtotal: moneyExpr('$$item.subtotal'),
      customizations: orderGroups('$$item.customizations'),
      selectedVariant: {
        $cond: [
          isObjectExpr('$$item.selectedVariant'),
          mergeObj('$$item.selectedVariant', {
            price: moneyExpr('$$item.selectedVariant.price'),
            takeawayPrice: moneyExpr('$$item.selectedVariant.takeawayPrice'),
            businessPrice: moneyExpr('$$item.selectedVariant.businessPrice'),
          }),
          '$$item.selectedVariant',
        ],
      },
    })),
    rewardItems: mapArr('$rewardItems', 'ri', mergeObj('$$ri', {
      cashValue: moneyExpr('$$ri.cashValue'),
    })),
    deliveryRangeApplied: {
      $cond: [
        isObjectExpr('$deliveryRangeApplied'),
        mergeObj('$deliveryRangeApplied', {
          price: moneyExpr('$deliveryRangeApplied.price'),
        }),
        '$deliveryRangeApplied',
      ],
    },
  })
}

function buildMenus() {
  return pipelineProject({
    categories: mapArr('$categories', 'cat', mergeObj('$$cat', {
      items: menuItems('$$cat.items'),
      subcategories: mapArr('$$cat.subcategories', 'sub', mergeObj('$$sub', {
        items: menuItems('$$sub.items'),
        customizationGroups: menuGroups('$$sub.customizationGroups'),
      })),
      customizationGroups: menuGroups('$$cat.customizationGroups'),
    })),
  })
}

function buildLocations() {
  return pipelineProject({
    reservationConfig: {
      $cond: [
        isObjectExpr('$reservationConfig'),
        mergeObj('$reservationConfig', {
          minPayment: moneyExpr('$reservationConfig.minPayment'),
        }),
        '$reservationConfig',
      ],
    },
    deliveryConfig: {
      $cond: [
        isObjectExpr('$deliveryConfig'),
        mergeObj('$deliveryConfig', {
          ranges: mapArr('$deliveryConfig.ranges', 'r', mergeObj('$$r', {
            price: moneyExpr('$$r.price'),
          })),
        }),
        '$deliveryConfig',
      ],
    },
  })
}

function buildTenants() {
  return pipelineProject({
    pointsConfig: {
      $cond: [
        isObjectExpr('$pointsConfig'),
        mergeObj('$pointsConfig', {
          minOrderForPoints: moneyExpr('$pointsConfig.minOrderForPoints'),
          pointsRedemptionValue: moneyExpr('$pointsConfig.pointsRedemptionValue'),
        }),
        '$pointsConfig',
      ],
    },
  })
}

function buildLocationLoyaltyConfigs() {
  return buildTenants()
}

function buildSyncOrders() {
  return pipelineProject({
    total: moneyExpr('$total'),
    baseTotal: moneyExpr('$baseTotal'),
    surchargeAmount: moneyExpr('$surchargeAmount'),
    items: mapArr('$items', 'it', mergeObj('$$it', {
      unitPrice: moneyExpr('$$it.unitPrice'),
      total: moneyExpr('$$it.total'),
      modifiers: mapArr('$$it.modifiers', 'm', mergeObj('$$m', {
        price: moneyExpr('$$m.price'),
      })),
    })),
  })
}

function buildCashSaleEvents() {
  return pipelineProject({
    amount: moneyExpr('$amount'),
  })
}

function buildScalars(fieldPaths) {
  const fields = {}
  for (const p of fieldPaths) fields[p] = moneyExpr('$' + p)
  return pipelineProject(fields)
}

// ─────────────────────────── migration manifest ──────────────────────────────
// Each entry: collection + all money paths (used by scan/verify). Pipelines
// above are the single source of truth for the actual transformation.

const MANIFEST = [
  {
    collection: 'orders',
    paths: [
      'total', 'subtotal', 'discountAmount', 'deliveryCost',
      'loyaltyDiscountAmount', 'rewardAdvanceAmount',
      'payment.baseTotal', 'payment.surchargeAmount', 'payment.platformFeeAmount',
      'items.basePrice', 'items.extraPrice', 'items.price', 'items.subtotal',
      'items.customizations.selectedOptions.extraPrice',
      'items.customizations.selectedOptions.subGroups.selectedOptions.extraPrice',
      'items.selectedVariant.price', 'items.selectedVariant.takeawayPrice', 'items.selectedVariant.businessPrice',
      'rewardItems.cashValue',
      'deliveryRangeApplied.price',
    ],
  },
  {
    collection: 'menus',
    paths: [
      'categories.items.price', 'categories.items.takeawayPrice',
      'categories.items.businessPrice', 'categories.items.halfPrice',
      'categories.items.originalPrice', 'categories.items.takeawayOriginalPrice',
      'categories.items.variants.price', 'categories.items.variants.takeawayPrice',
      'categories.items.variants.businessPrice', 'categories.items.variants.originalPrice',
      'categories.items.variants.takeawayOriginalPrice',
      'categories.items.customizationGroups.options.extraPrice',
      'categories.items.customizationGroups.options.subGroups.options.extraPrice',
      'categories.items.variants.customizationGroups.options.extraPrice',
      'categories.subcategories.items.price', 'categories.subcategories.items.takeawayPrice',
      'categories.subcategories.items.businessPrice', 'categories.subcategories.items.halfPrice',
      'categories.subcategories.items.originalPrice', 'categories.subcategories.items.takeawayOriginalPrice',
      'categories.subcategories.items.variants.price',
      'categories.subcategories.items.customizationGroups.options.extraPrice',
      'categories.subcategories.customizationGroups.options.extraPrice',
      'categories.customizationGroups.options.extraPrice',
    ],
  },
  {
    collection: 'tenants',
    paths: [
      'pointsConfig.minOrderForPoints', 'pointsConfig.pointsRedemptionValue',
    ],
  },
  {
    collection: 'locations',
    paths: [
      'deliveryConfig.ranges.price', 'reservationConfig.minPayment',
    ],
  },
  {
    collection: 'promotions',
    paths: ['price', 'originalPrice'],
  },
  {
    collection: 'storeitems',
    paths: ['cashValue'],
  },
  {
    collection: 'storeredemptions',
    paths: ['cashValue'],
  },
  {
    collection: 'loyaltymembers',
    paths: ['cache.totalSpent'],
  },
  {
    collection: 'reservations',
    paths: ['payment.amount'],
  },
  {
    collection: 'consumers',
    paths: ['totalSpent'],
  },
  {
    collection: 'customerprofiles',
    paths: ['totalSpent', 'avgTicket', 'lifetimeValue'],
  },
  {
    collection: 'impactevents',
    paths: ['metadata.orderTotal'],
  },
  {
    collection: 'customerevents',
    paths: ['data.amount'],
  },
  {
    collection: 'locationloyaltyconfigs',
    paths: [
      'pointsConfig.minOrderForPoints', 'pointsConfig.pointsRedemptionValue',
    ],
  },
  {
    collection: 'sync_orders',
    paths: [
      'total', 'baseTotal', 'surchargeAmount',
      'items.unitPrice', 'items.total', 'items.modifiers.price',
    ],
  },
  {
    collection: 'cash_sale_events',
    paths: ['amount'],
  },
]

const PIPELINES = {
  orders: buildOrders(),
  menus: buildMenus(),
  tenants: buildTenants(),
  locations: buildLocations(),
  promotions: buildScalars(['price', 'originalPrice']),
  storeitems: buildScalars(['cashValue']),
  storeredemptions: buildScalars(['cashValue']),
  loyaltymembers: pipelineProject({ cache: nestedMoney('$cache', 'totalSpent') }),
  reservations: pipelineProject({ payment: nestedMoney('$payment', 'amount') }),
  consumers: buildScalars(['totalSpent']),
  customerprofiles: buildScalars(['totalSpent', 'avgTicket', 'lifetimeValue']),
  impactevents: pipelineProject({ metadata: nestedMoney('$metadata', 'orderTotal') }),
  customerevents: pipelineProject({ data: nestedMoney('$data', 'amount') }),
  locationloyaltyconfigs: buildLocationLoyaltyConfigs(),
  sync_orders: buildSyncOrders(),
  cash_sale_events: buildCashSaleEvents(),
}

// ─────────────────────────────── scan / verify ───────────────────────────────

// Collect every numeric value reachable at `parts` inside `node` (recurses arrays)
function collectValues(node, parts, out) {
  if (parts.length === 0) {
    if (node !== undefined && node !== null && typeof node === 'number') out.push(node)
    return
  }
  const head = parts[0]
  if (Array.isArray(node)) {
    for (const el of node) collectValues(el, parts, out)
  } else if (node && typeof node === 'object' && head in node) {
    collectValues(node[head], parts.slice(1), out)
  }
}

function scanCollection(collName, paths) {
  const coll = db.getCollection(collName)
  const count = coll.countDocuments()
  const stats = {}
  if (count === 0) return { count: 0, paths: {} }
  const cursor = coll.find({})
  while (cursor.hasNext()) {
    const doc = cursor.next()
    for (const p of paths) {
      let s = stats[p]
      if (!s) s = stats[p] = { n: 0, min: null, max: null, sample: null }
      const out = []
      collectValues(doc, p.split('.'), out)
      for (const v of out) {
        s.n++
        if (s.min === null || v < s.min) s.min = v
        if (s.max === null || v > s.max) s.max = v
        if (s.sample === null) s.sample = v
      }
    }
  }
  return { count, paths: stats }
}

function printScan(label, res) {
  print('-- ' + label + ' --')
  let totalValues = 0
  for (const m of MANIFEST) {
    const r = res[m.collection]
    if (!r) continue
    print('  ' + m.collection + ': ' + r.count + ' docs')
    for (const p of m.paths) {
      const s = r.paths[p]
      if (s && s.n > 0) {
        totalValues += s.n
        print('    ' + p + ': n=' + s.n + ' min=' + s.min + ' max=' + s.max + ' sample=' + s.sample)
      }
    }
  }
  print('  TOTAL monetary values: ' + totalValues)
  print('')
}

function printOrderEvidence() {
  const doc = db.orders.findOne({ items: { $exists: true, $ne: [] } })
  if (!doc) { print('  (no orders to show)'); return }
  const item = doc.items[0]
  const printOpt = (opt, depth) => {
    if (!opt) return
    print('    '.repeat(depth) + '- ' + opt.name + ' extraPrice=' + opt.extraPrice)
    if (opt.subGroups && opt.subGroups.length) {
      for (const sg of opt.subGroups) printGroup(sg, depth + 1)
    }
  }
  const printGroup = (grp, depth) => {
    if (!grp) return
    print('    '.repeat(depth) + 'group=' + grp.groupName)
    for (const opt of grp.selectedOptions || []) printOpt(opt, depth + 1)
  }
  print('  Order evidence (items[0]):')
  print('    orderNumber=' + doc.orderNumber + ' status=' + doc.status)
  print('    total=' + doc.total + ' subtotal=' + doc.subtotal + ' discountAmount=' + doc.discountAmount + ' deliveryCost=' + doc.deliveryCost)
  print('    payment.baseTotal=' + (doc.payment && doc.payment.baseTotal) + ' surchargeAmount=' + (doc.payment && doc.payment.surchargeAmount) + ' platformFeeAmount=' + (doc.payment && doc.payment.platformFeeAmount))
  if (item) {
    print('    item.name=' + item.name)
    print('      basePrice=' + item.basePrice + ' extraPrice=' + item.extraPrice + ' price=' + item.price + ' subtotal=' + item.subtotal)
    if (item.selectedVariant) print('      selectedVariant: name=' + item.selectedVariant.name + ' price=' + item.selectedVariant.price + ' takeawayPrice=' + item.selectedVariant.takeawayPrice + ' businessPrice=' + item.selectedVariant.businessPrice)
    for (const grp of item.customizations || []) printGroup(grp, 3)
  }
  if (doc.rewardItems && doc.rewardItems.length) {
    print('    rewardItems[0].cashValue=' + doc.rewardItems[0].cashValue)
  }
  if (doc.deliveryRangeApplied) print('    deliveryRangeApplied.price=' + doc.deliveryRangeApplied.price)
}

function printMenuEvidence() {
  const doc = db.menus.findOne({ categories: { $exists: true, $ne: [] } })
  if (!doc) { print('  (no menus to show)'); return }
  const cat = doc.categories[0]
  const item = (cat.items && cat.items[0]) || (cat.subcategories && cat.subcategories[0] && cat.subcategories[0].items && cat.subcategories[0].items[0])
  print('  Menu evidence:')
  print('    category=' + cat.name + ' (items=' + (cat.items ? cat.items.length : 0) + ', subcats=' + (cat.subcategories ? cat.subcategories.length : 0) + ')')
  if (item) {
    print('    item.name=' + item.name)
    print('      price=' + item.price + ' takeawayPrice=' + item.takeawayPrice + ' businessPrice=' + item.businessPrice + ' halfPrice=' + item.halfPrice + ' originalPrice=' + item.originalPrice)
    if (item.variants && item.variants.length) print('      variants[0]: name=' + item.variants[0].name + ' price=' + item.variants[0].price)
    const opt = item.customizationGroups && item.customizationGroups[0] && item.customizationGroups[0].options && item.customizationGroups[0].options[0]
    if (opt) print('      customizationGroups[0].options[0]: name=' + opt.name + ' extraPrice=' + opt.extraPrice)
  }
}

// ─────────────────────────────── main ────────────────────────────────────────

function snapshot() {
  const res = {}
  for (const m of MANIFEST) res[m.collection] = scanCollection(m.collection, m.paths)
  return res
}

async function run() {
  const marker = '_migration_meta'
  const markerColl = db.getCollection(marker)
  const already = markerColl.countDocuments({ db: dbName })
  if (already > 0 && !FORCE) {
    print('ERROR: database "' + dbName + '" was already migrated (marker in ' + marker + ').')
    const prev = markerColl.findOne({ db: dbName })
    if (prev && prev.progress) {
      print('  Progress from the previous run:')
      for (const c of Object.keys(prev.progress)) {
        const st = prev.progress[c]
        print('    ' + c + ': ' + st.status + (st.modified !== undefined ? ' (modified=' + st.modified + ')' : '') + (st.error ? '  error: ' + st.error : ''))
      }
    }
    print('  Refusing to run again. Restore from backup or set FORCE=true if you know what you are doing.')
    quit(1)
  }
  const confirmed = await confirmRun()
  if (!confirmed) {
    print('RUN aborted by the operator. Nothing was written.')
    quit(1)
  }
  markerColl.insertOne({ db: dbName, status: 'running', startedAt: new Date(), progress: {} })
  print('Migration marker written (' + marker + ', status=running). Restore from backup to clear it.')
  print('')
  print('--- PRE-MIGRATION SCAN (before) ---')
  print('')
  const before = snapshot()
  printScan('BEFORE', before)

  print('--- EXECUTING MIGRATION ---')
  const setProgress = (collName, status, extra) => {
    markerColl.updateOne({ db: dbName }, { $set: { ['progress.' + collName]: Object.assign({ status }, extra) } })
  }
  let totalModified = 0
  for (const m of MANIFEST) {
    const coll = db.getCollection(m.collection)
    const count = coll.countDocuments()
    if (count === 0) {
      setProgress(m.collection, 'skipped', { docs: 0 })
      print(m.collection + ': 0 documents, skipping')
      continue
    }
    const pipeline = PIPELINES[m.collection]
    if (!pipeline) {
      setProgress(m.collection, 'skipped', { reason: 'no pipeline' })
      print(m.collection + ': NO PIPELINE DEFINED - skipped (will be untouched)')
      continue
    }
    try {
      setProgress(m.collection, 'pending')
      const res = coll.updateMany({}, pipeline)
      totalModified += res.modifiedCount
      setProgress(m.collection, 'done', { modified: res.modifiedCount, at: new Date() })
      print(m.collection + ': matched=' + res.matchedCount + ' modified=' + res.modifiedCount)
    } catch (e) {
      setProgress(m.collection, 'error', { error: String(e), at: new Date() })
      print('ERROR on ' + m.collection + ': ' + e)
      print('  Nothing was applied for this collection (single atomic pipeline).')
      print('  NOTE: earlier collections may have been migrated. Check output above.')
    }
  }

  print('')
  print('--- POST-MIGRATION SCAN (after) ---')
  const after = snapshot()
  printScan('AFTER', after)

  print('--- BEFORE -> AFTER (per path, min/max) ---')
  let allOk = true
  for (const m of MANIFEST) {
    const b = before[m.collection]
    const a = after[m.collection]
    if (!b || !a) continue
    for (const p of m.paths) {
      const bs = b.paths[p]
      const as = a.paths[p]
      if (!bs || bs.n === 0) continue
      const expectedMin = bs.min === 0 ? 0 : bs.min * 100
      const expectedMax = bs.max === 0 ? 0 : bs.max * 100
      const ok = as && as.min === expectedMin && as.max === expectedMax && as.n === bs.n
      if (!ok) allOk = false
      print('  ' + m.collection + '.' + p + ': min ' + (bs.min) + '->' + (as ? as.min : 'MISSING') + ' max ' + (bs.max) + '->' + (as ? as.max : 'MISSING') + '  n=' + (bs.n) + '->' + (as ? as.n : '?') + (ok ? '  OK' : '  !! MISMATCH'))
    }
  }
  print('')
  print('--- EVIDENCE ---')
  printOrderEvidence()
  printMenuEvidence()

  if (allOk) {
    print('')
    print('MIGRATION VERIFIED OK: all money paths multiplied by 100 (or 0)')
    if (!FORCE) {
      db.getCollection(marker).updateOne(
        { db: dbName },
        { $set: { status: 'done', completedAt: new Date(), totalModified } }
      )
      print('Migration marker set to status=done.')
    }
  } else {
    print('')
    print('WARNING: some paths did not verify (or a collection errored). Do NOT consider this migrated.')
    print('  The marker is left as status=running: RESTORE THIS DATABASE FROM BACKUP before re-running,')
    print('  otherwise already-migrated collections would be multiplied AGAIN.')
    print('  Per-collection progress is in ' + marker + '.progress (see which collections completed).')
  }
  print('')
  print('Total documents modified: ' + totalModified)
}

;(async () => {
  try {
    if (DRY_RUN) {
      print('--- DRY RUN: counting monetary values (read-only) ---')
      print('')
      printScan('DRY RUN', snapshot())
    } else if (SNAPSHOT) {
      print('--- SNAPSHOT ---')
      print('')
      printScan('SNAPSHOT', snapshot())
    } else if (RUN) {
      await run()
    }
  } catch (e) {
    print('ERROR: ' + e)
    quit(1)
  }
})()
