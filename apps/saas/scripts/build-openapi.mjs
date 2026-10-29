#!/usr/bin/env node
// ============================================================================
// OpenAPI 3.1 de TakeasyGO — generado DEL CÓDIGO (reemplaza docs/openapi y
// docs/scripts/*.py, que describían solo el Sync, eran JSON inválido y no
// corrían). Fuentes:
//   · SaaS  apps/saas/app/api/[tenant]/pos/**/route.ts   (API POS online)
//           apps/saas/app/api/[tenant]/assistant/**      (TEO)
//   · Sync  apps/sync/src/routes/index.ts + cada router  (EC2, /api/v1)
// Por cada ruta: métodos exportados, comentario de cabecera (resumen por
// método si existe «// GET /ruta — texto»), capability de posRoute y esquema
// de autenticación según dónde se monta.
//
// Uso:  node scripts/build-openapi.mjs          (escribe lib/openapi/openapi.generated.json)
//       node scripts/build-openapi.mjs --check  (falla si está desactualizado)
// El test __tests__/lib/openapi-spec.test.ts corre el --check: una ruta
// nueva sin regenerar el spec rompe CI.
// ============================================================================

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SAAS = join(here, '..')
const REPO = join(SAAS, '..', '..')
const SYNC_ROUTES = join(REPO, 'apps', 'sync', 'src', 'routes')
const OUT = join(SAAS, 'lib', 'openapi', 'openapi.generated.json')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const SAAS_GROUPS = [
  { dir: join(SAAS, 'app', 'api', '[tenant]', 'pos'), tag: 'POS online (SaaS)' },
  { dir: join(SAAS, 'app', 'api', '[tenant]', 'assistant'), tag: 'Asistente TEO' },
]

function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

/** Comentarios de cabecera (antes del primer código que no sea import/comentario). */
function headerComment(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let started = false
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('import ') || line.startsWith('} from') || line.startsWith('type ') && !started) {
      continue
    }
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      started = true
      // Se conserva la sangría: una línea sangrada continúa la anterior.
      const text = line.replace(/^\/\/ ?|^\/\*+ ?|^\*\/? ?|\*\/$/g, '').replace(/\s+$/, '')
      if (/^[=─-]{6,}$/.test(text.trim())) continue
      out.push(text)
      continue
    }
    if (line === '' && !started) continue
    if (line === '' && started) {
      out.push('')
      continue
    }
    if (started || /^(export|const|function|async|interface|let)\b/.test(line)) break
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Une a cada línea sus continuaciones (la frase sigue en minúscula). */
function logicalLines(comment) {
  const out = []
  for (const line of comment.split('\n')) {
    const t = line.trim()
    if (/^[a-záéíóúñ(«]/.test(t) && out.length && out[out.length - 1]) out[out.length - 1] += ' ' + t
    else out.push(t)
  }
  return out
}

/** Comentario inmediatamente anterior a la posición `index` (para rutas del Sync). */
function commentAbove(src, index) {
  const before = src.slice(0, index).replace(/\r\n/g, '\n').split('\n')
  before.pop() // la línea de la propia llamada
  const block = []
  for (let i = before.length - 1; i >= 0 && block.length < 12; i--) {
    const t = before[i].trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) {
      const text = t.replace(/^\/\/ ?|^\/\*+ ?|^\*\/? ?|\*\/$/g, '').trim()
      // Separadores («── POST /api/v1/x ──…») no son texto.
      if (text && !/^[=─-]{6,}$/.test(text) && !/^──/.test(text)) block.unshift(text)
    } else break
  }
  return block.join('\n')
}

function clip(text) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= 140 ? t : t.slice(0, 140).replace(/\s+\S*$/, '') + '…'
}

/** «// GET /ruta — texto» (también «GET, POST …») → resumen por método. */
function methodSummaries(comment) {
  const map = {}
  for (const line of logicalLines(comment)) {
    const m = /^((?:GET|POST|PUT|PATCH|DELETE)(?:\s*[,/|]\s*(?:GET|POST|PUT|PATCH|DELETE))*)\b[^—–]*?[—–]\s*(.+)$/.exec(line)
    if (!m) continue
    for (const method of m[1].split(/[\s,/|]+/)) if (!map[method]) map[method] = clip(m[2])
  }
  return map
}

/** Resumen del archivo: «/api/… — texto» de la cabecera o su primer párrafo. */
function firstSentence(comment, fallback) {
  const lines = logicalLines(comment)
  const titled = lines.map((l) => /^\/api\/\S+\s+[—–]\s*(.+)$/.exec(l)).find(Boolean)
  if (titled) return clip(titled[1])
  const start = lines.findIndex((l) => l && !/^(GET|POST|PUT|PATCH|DELETE)\b/.test(l) && !l.startsWith('/api/'))
  if (start < 0) return fallback
  const para = []
  for (let i = start; i < lines.length && lines[i] && !/^[-·•]\s/.test(lines[i]); i++) para.push(lines[i])
  const text = para.join(' ')
  const sentence = /^(.{20,}?[.;])(\s|$)/.exec(text)?.[1] ?? text
  return clip(sentence.replace(/[.;]$/, ''))
}

function pathParams(path) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
}

function paramObjects(path) {
  return pathParams(path).map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: name === 'tenant' ? 'Slug o id del comercio (el JWT del POS debe ser de ese comercio).' : undefined,
  }))
}

const ERR = (ref) => ({ description: ref, content: { 'application/json': { schema: { $ref: '#/components/schemas/PosError' } } } })

function operation({ method, path, tag, summary, description, security, extra, sourceFile, bodyHint }) {
  const op = {
    tags: [tag],
    operationId: `${method.toLowerCase()}_${path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    summary,
    description: [description, `Fuente: \`${sourceFile}\``].filter(Boolean).join('\n\n'),
    parameters: paramObjects(path).map((p) => (p.description ? p : { ...p, description: undefined })).map((p) => JSON.parse(JSON.stringify(p))),
    responses: {
      200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
      400: ERR('Validación'),
      401: ERR('Sin autenticación o token vencido'),
      403: ERR('Rol o capability insuficiente, o sede ajena'),
    },
    security,
    ...extra,
  }
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    op.requestBody = { required: bodyHint !== 'optional', content: { 'application/json': { schema: { type: 'object' } } } }
  }
  if (op.parameters.length === 0) delete op.parameters
  return op
}

// ── SaaS ────────────────────────────────────────────────────────────────────

function saasRoutes() {
  const ops = []
  for (const group of SAAS_GROUPS) {
    for (const file of walk(group.dir)) {
      const rel = relative(join(SAAS, 'app'), dirname(file)).split(sep).join('/')
      const path = '/' + rel.replace(/\[([^\]]+)\]/g, '{$1}')
      const src = readFileSync(file, 'utf8')
      const comment = headerComment(src)
      const perMethod = methodSummaries(comment)
      for (const method of METHODS) {
        const exp = new RegExp(`export\\s+(?:const\\s+${method}\\s*=\\s*([\\s\\S]{0,120}?)\\(|async\\s+function\\s+${method}\\b)`)
        const m = exp.exec(src)
        if (!m) continue
        const capMatch = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*posRoute(?:<[^>]*>)?\\(\\s*'([a-z.]+)'`).exec(src)
        const isAssistant = group.tag === 'Asistente TEO'
        ops.push({
          path,
          method,
          op: operation({
            method,
            path,
            tag: group.tag,
            summary: perMethod[method] ?? firstSentence(comment, `${method} ${path}`),
            description: comment,
            security: isAssistant ? [{ SessionCookie: [] }] : [{ PosBearer: [] }],
            extra: capMatch ? { 'x-pos-capability': capMatch[1] } : {},
            sourceFile: relative(REPO, file).split(sep).join('/'),
          }),
        })
      }
    }
  }
  return ops
}

// ── Sync ────────────────────────────────────────────────────────────────────

/** Resúmenes para rutas del Sync cuyo comentario no describe la operación. */
const SYNC_SUMMARIES = {
  'POST /auth/login': 'Login del POS (modo email+contraseña o PIN de empleado): emite el JWT RS256',
  'POST /auth/logout': 'Cierra la sesión: revoca el token (denylist por jti)',
  'POST /auth/refresh': 'Renueva el JWT vigente (rota el jti; tope absoluto desde el login original)',
  'POST /auth/sso-token': 'Token de un solo uso (60 s) para abrir el SaaS desde la terminal de caja sin volver a loguearse',
  'GET /health': 'Salud del servicio (sin autenticación)',
  'POST /internal/orders': 'SaaS → Sync: pedido nuevo de la App/web para emitir al POS de la sede',
  'GET /internal/orders': 'SaaS → Sync: pedidos sincronizados (diagnóstico)',
  'PATCH /internal/orders/:orderId/confirm': 'SaaS → Sync: confirmación del pedido para reflejarla en el POS',
  'POST /internal/orders/:orderId/status': 'SaaS → Sync: cambio de estado del pedido para reflejarlo en el POS',
  'GET /locations': 'Sedes del comercio del token',
  'GET /menu/snapshot': 'Snapshot del menú para trabajar offline',
  'GET /orders': 'Pedidos del comercio/sede del token',
  'GET /orders/pending': 'Pedidos pendientes para el POS (incluye entregados de las últimas 24 h para reconciliar lo que pasó offline)',
  'POST /orders': 'Crea un pedido desde el POS (validado con zod)',
  'PATCH /orders/:orderId/confirm': 'El POS confirma (acepta) un pedido de la App',
  'POST /orders/:orderId/status': 'Cambio de estado de un pedido desde el POS (se reenvía al SaaS)',
  'POST /pairing/hub-publish': 'Emparejamiento: el equipo principal publica el código',
  'POST /pairing/spoke-claim': 'Emparejamiento: un equipo secundario reclama el código',
  'POST /pairing/approve': 'Emparejamiento: el principal aprueba al secundario',
  'POST /sync/replay': 'Reenvía en orden los eventos que el POS generó offline (idempotente)',
  'GET /sync/conflicts': 'Conflictos de sincronización pendientes',
  'POST /sync/conflicts/:eventId/resolve': 'Resuelve un conflicto de sincronización',
  'GET /delivery/persons': 'Repartidores del comercio',
  'GET /delivery/orders': 'Pedidos de delivery para asignar',
  'POST /delivery/assign': 'Asigna un repartidor a un pedido',
}

function syncRoutes() {
  const index = readFileSync(join(SYNC_ROUTES, 'index.ts'), 'utf8')
  const imports = {}
  for (const m of index.matchAll(/import\s+\{([^}]+)\}\s+from\s+"\.\/([\w-]+)"/g)) {
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) imports[name] = `${m[2]}.ts`
  }
  const authLine = index.search(/router\.use\(authMiddleware\)/)
  const ops = []
  for (const m of index.matchAll(/router\.use\("([^"]+)",\s*(\w+)/g)) {
    const [, mount, name] = m
    const file = imports[name]
    if (!file) continue // middlewares (p. ej. logoutIpRateLimiter)
    const afterAuth = m.index > authLine
    const src = readFileSync(join(SYNC_ROUTES, file), 'utf8')
    const comment = headerComment(src)
    const routerVar = new RegExp(`\\b${name}\\.(get|post|put|patch|delete)\\(`).test(src) ? name : 'router'
    const re = new RegExp(`\\b${routerVar}\\.(get|post|put|patch|delete)\\(\\s*["']([^"']+)["']([^\\n]*)`, 'g')
    for (const r of src.matchAll(re)) {
      const method = r[1].toUpperCase()
      const sub = r[2] === '/' ? '' : r[2]
      const path = `/api/v1${mount}${sub}`.replace(/:(\w+)/g, '{$1}')
      const routeHasJwt = /authMiddleware|deliverAuth/.test(r[3])
      let security
      if (afterAuth || routeHasJwt) security = [{ SyncBearer: [] }]
      else if (mount === '/internal' || mount === '/cash-sale') security = [{ InternalSecret: [] }]
      else security = []
      if (mount === '/cash-sale' && /deliverAuth/.test(r[3])) security = [{ InternalSecret: [] }, { SyncBearer: [] }]
      const above = commentAbove(src, r.index)
      ops.push({
        path,
        method,
        op: operation({
          method,
          path,
          tag: `Sync (EC2)${mount === '/internal' ? ' · interno' : ''}`,
          summary:
            SYNC_SUMMARIES[`${method} ${mount}${r[2] === '/' ? '' : r[2]}`] ??
            (above ? firstSentence(above, `${method} ${mount}${sub}`) : `${method} ${mount}${sub}`),
          description: [above, comment].filter(Boolean).join('\n\n'),
          security,
          extra: {},
          sourceFile: `apps/sync/src/routes/${file}`,
          bodyHint: 'optional',
        }),
      })
    }
  }
  return ops
}

export function buildSpec() {
  const paths = {}
  for (const { path, method, op } of [...saasRoutes(), ...syncRoutes()]) {
    paths[path] ??= {}
    paths[path][method.toLowerCase()] = op
  }
  const sorted = Object.fromEntries(Object.keys(paths).sort().map((k) => [k, paths[k]]))
  return {
    openapi: '3.1.0',
    info: {
      title: 'TakeasyGO API',
      version: '1.0.0',
      description: [
        'API del POS online (SaaS, Vercel), del asistente TEO y de la capa de sincronización (Sync, EC2).',
        '',
        '**Reglas de oro**',
        '- Montos SIEMPRE en centavos enteros (1 peso = 100).',
        '- Aislamiento multi-tenant: el comercio sale del token, nunca del body; toda consulta filtra por tenantId primero.',
        '- Cierre ciego: el cajero no recibe esperados ni diferencias de caja.',
        '',
        'Generado desde el código con `apps/saas/scripts/build-openapi.mjs`. No editar a mano.',
      ].join('\n'),
    },
    servers: [
      { url: 'https://www.takeasygo.com', description: 'SaaS (rutas /api/{tenant}/…)' },
      { url: 'https://sync.takeasygo.com', description: 'Sync EC2 (rutas /api/v1/…)' },
    ],
    tags: [
      { name: 'POS online (SaaS)', description: 'Operación del POS contra el SaaS: órdenes, mesas, caja, facturación, reportes. JWT RS256 del POS + capability por rol.' },
      { name: 'Asistente TEO', description: 'Asistente de soporte del panel (sesión NextAuth). Rol, negocio y módulos los fija el servidor.' },
      { name: 'Sync (EC2)', description: 'Login del POS, tiempo real, replay offline, emparejamiento, clientes.' },
      { name: 'Sync (EC2) · interno', description: 'Server-to-server SaaS → Sync. Secreto interno; nunca desde el navegador.' },
    ],
    paths: sorted,
    components: {
      securitySchemes: {
        PosBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT RS256', description: 'Token del POS emitido por el Sync (POST /api/v1/auth/login). El SaaS lo valida con POS_JWT_PUBLIC_KEY.' },
        SyncBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT RS256', description: 'Mismo token del POS, validado por el Sync.' },
        InternalSecret: { type: 'apiKey', in: 'header', name: 'X-Internal-Secret', description: 'Secreto server-to-server (SYNC_LAYER_SECRET del SaaS = INTERNAL_API_SECRET del Sync).' },
        SessionCookie: { type: 'apiKey', in: 'cookie', name: '__Secure-authjs.session-token', description: 'Sesión NextAuth del panel admin.' },
      },
      schemas: {
        PosError: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              oneOf: [
                {
                  type: 'object',
                  required: ['code', 'message'],
                  properties: {
                    code: { type: 'string', description: 'Código estable (validation, unauthorized, forbidden, not_found, conflict, …)' },
                    message: { type: 'string' },
                    detail: { type: 'string' },
                  },
                },
                { type: 'string', description: 'Rutas del Sync y del asistente: mensaje simple.' },
              ],
            },
          },
        },
        MoneyCents: { type: 'integer', minimum: 0, description: 'Monto en centavos.' },
      },
    },
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const json = JSON.stringify(buildSpec(), null, 1) + '\n'
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : ''
    if (current !== json) {
      console.error('openapi.generated.json está desactualizado: corré `node scripts/build-openapi.mjs`')
      process.exit(1)
    }
    console.log('OpenAPI al día')
  } else {
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, json)
    const spec = JSON.parse(json)
    const ops = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0)
    console.log(`OpenAPI: ${Object.keys(spec.paths).length} rutas, ${ops} operaciones → ${OUT}`)
  }
}
