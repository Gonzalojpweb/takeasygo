# Club de Fidelización — Documentación Técnica Completa

## Índice

1. [Resumen del Módulo](#1-resumen-del-módulo)
2. [Modelo de Datos](#2-modelo-de-datos)
3. [Integración con Planes SaaS](#3-integración-con-planes-saas)
4. [APIs Implementadas](#4-apis-implementadas)
5. [Componentes UI](#5-componentes-ui)
6. [Páginas](#6-páginas)
7. [Integración en Checkout](#7-integración-en-checkout)
8. [Integración con Webhooks](#8-integración-con-webhooks)
9. [Seguridad y Privacidad](#9-seguridad-y-privacidad)
10. [Fase 2 — Sistema de Puntos y Niveles](#10-fase-2--sistema-de-puntos-y-niveles)
11. [Pendientes](#11-pendientes)
12. [Checklist de Implementación](#12-checklist-de-implementación)

---

## 1. Resumen del Módulo

El **Club de Fidelización** permite a los restaurantes capturar clientes frecuentes y vincular pedidos a membresías. Los clientes pueden registrarse escaneando un código QR en el local o durante el checkout.

### Objetivos

- Capturar clientes frecuentes con su consentimiento
- Vincular pedidos a membresías para calcular recurrenciasssssss
- Generar métricas de recompra y engagement
- Sentar la base para un sistema de puntos y recompensas (Fase 2)

### Flujo de Registro

```
Cliente escanea QR
       ↓
POST /api/[tenant]/loyalty/register
       ↓
   Rate limit check (3/10min por IP)
       ↓
   ¿Ya existe miembro?
   → Sí: Devuelve datos existentes
   → No: Verifica límite del plan
          ↓
       Crea LoyaltyMember
       (source: 'qr_scan')
```

---

## 2. Modelo de Datos

### `models/LoyaltyMember.ts`

```typescript
interface ILoyaltyMember extends Document {
  // Identificación
  tenantId:  mongoose.Types.ObjectId
  name:      string
  phone:     string
  email:     string
  phoneHash: string   // SHA-256(phone) — nunca se expone en texto plano

  // Estado de membresía
  status:   'active' | 'inactive' | 'blocked'
  joinedAt:  Date
  source:    'checkout' | 'qr_scan' | 'admin' | 'manual_import'

  // Caché de actividad (actualizada post-pedido)
  cache: {
    totalOrders: number
    totalSpent:  number
    lastOrderAt: Date | null
    updatedAt:   Date | null
  }

  // Fase 2 — puntos y niveles (vacío en Fase 1)
  loyalty: {
    points: number
    tier:   'none' | 'bronze' | 'silver' | 'gold'
  }

  notes: string
}
```

### Índices Compuestos

```javascript
{ tenantId: 1, phoneHash: 1 }       // unique, sparse — un cliente por club
{ tenantId: 1, email: 1 }
{ tenantId: 1, status: 1, joinedAt: -1 }  // listado con filtros
{ tenantId: 1, source: 1 }
```

### Helper Estático

```typescript
// Genera hash SHA-256 normalizado del teléfono
LoyaltyMemberSchema.statics.hashPhone = function (phone: string): string {
  const normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}
```

### Configuración en `models/Tenant.ts`

```typescript
loyalty: {
  enabled:        boolean,  // Club activo/inactivo
  clubName:       string,  // Nombre del club (default: "Club [nombre_restaurante]")
  welcomeMessage: string,  // Mensaje de bienvenida editable
  createdAt:      Date,    // Cuándo se activó el club
}
```

---

## 3. Integración con Planes SaaS

### Feature Flags (`lib/plans.ts`)

```typescript
export const PLAN_ACCESS = {
  // Disponible en todos los planes excepto anfitrion
  loyaltyClub:      ['trial', 'try', 'buy', 'full'] as const,

  // Solo Crecimiento y Premium
  loyaltyExport:   ['buy', 'full'] as const,

  // Solo Premium — métricas avanzadas (Fase 2)
  loyaltyAnalytics: ['full'] as const,
}

// Límites de miembros por plan
export const LOYALTY_MEMBER_LIMIT: Record<Plan, number | null> = {
  trial:      30,     // Máximo 30 miembros
  try:       150,     // Máximo 150 miembros
  buy:       null,    // Ilimitado
  full:      null,    // Ilimitado
  anfitrion:   0,     // No tiene acceso a pedidos ni club
}
```

### Helper de Verificación

```typescript
import { canAccess, LOYALTY_MEMBER_LIMIT } from '@/lib/plans'

// Verificar acceso al club
if (!canAccess(tenant.plan, 'loyaltyClub')) {
  return NextResponse.json({ error: 'Plan no incluye el club' }, { status: 403 })
}

// Verificar límite de miembros
const limit = LOYALTY_MEMBER_LIMIT[tenant.plan]
if (limit !== null) {
  const currentCount = await LoyaltyMember.countDocuments({ tenantId, status: 'active' })
  if (currentCount >= limit) {
    return NextResponse.json({ error: 'Club alcanzó su capacidad máxima' }, { status: 409 })
  }
}
```

---

## 4. APIs Implementadas

### 4.1 Registro Público (QR y Checkout)

#### `POST /api/[tenant]/loyalty/register`

Registro de nuevos miembros vía código QR. No requiere autenticación.

**Rate Limiting:**
- 3 intentos por IP cada 10 minutos
- Implementación en memoria (para producción usar Upstash Redis)

**Request:**
```json
{
  "name": "Juan Pérez",
  "phone": "+5491112345678",
  "email": "juan@mail.com"
}
```

**Response (nuevo miembro):**
```json
{
  "alreadyMember": false,
  "member": {
    "id": "64abc123...",
    "name": "Juan Pérez",
    "joinedAt": "2026-04-08T10:00:00Z",
    "clubName": "Club La Pizzada",
    "welcomeMessage": "¡Bienvenido/a a Club La Pizzada!..."
  }
}
```

**Response (ya existe):**
```json
{
  "alreadyMember": true,
  "member": {
    "id": "64abc123...",
    "name": "Juan Pérez",
    "joinedAt": "2026-04-01T10:00:00Z",
    "clubName": "Club La Pizzada",
    "welcomeMessage": "¡Ya sos parte del club!"
  }
}
```

**Códigos de Error:**
- `400` — Nombre o teléfono requeridos
- `403` — Plan no incluye club o club no habilitado
- `409` — Límite de miembros alcanzado
- `429` — Rate limit excedido

---

#### `GET /api/[tenant]/loyalty/register?phone=XX`

Verifica si un teléfono ya está registrado.

**Response:**
```json
{
  "isMember": true,
  "member": {
    "id": "64abc123...",
    "name": "Juan Pérez",
    "joinedAt": "2026-04-01T10:00:00Z",
    "clubName": "Club La Pizzada"
  }
}
```

---

### 4.2 Gestión de Miembros (Admin)

#### `GET /api/[tenant]/loyalty/members`

Lista paginada de miembros con filtros.

**Query Parameters:**
| Param | Default | Descripción |
|-------|---------|-------------|
| `page` | 1 | Número de página |
| `limit` | 20 | Items por página (máx 100) |
| `search` | "" | Búsqueda por nombre/teléfono/email |
| `status` | "" | Filtrar por estado |
| `source` | "" | Filtrar por fuente |
| `sortBy` | joinedAt | Campo de ordenamiento |
| `sortOrder` | desc | `asc` o `desc` |

**Response:**
```json
{
  "members": [
    {
      "_id": "64abc123...",
      "name": "Juan Pérez",
      "phone": "****4567",
      "email": "juan@mail.com",
      "status": "active",
      "source": "qr_scan",
      "joinedAt": "2026-04-01T10:00:00Z",
      "cache": {
        "totalOrders": 5,
        "totalSpent": 12500,
        "lastOrderAt": "2026-04-05T20:00:00Z"
      },
      "notes": ""
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  },
  "summary": {
    "total": 45,
    "active": 40,
    "inactive": 5
  }
}
```

**Nota:** Los teléfonos se maskizan como `****XXXX` (últimos 4 dígitos).

---

#### `POST /api/[tenant]/loyalty/members`

Crea un miembro manualmente desde el admin.

**Request:**
```json
{
  "name": "María García",
  "phone": "+5491187654321",
  "email": "maria@mail.com",
  "notes": "Cliente VIP"
}
```

**Response:** `{ "member": { ... } }` (status 201)

---

#### `GET /api/[tenant]/loyalty/members/[id]`

Obtiene detalle de un miembro.

---

#### `PATCH /api/[tenant]/loyalty/members/[id]`

Actualiza campos de un miembro.

**Campos actualizables:**
- `name` — Nombre
- `email` — Email
- `status` — `active` | `inactive` | `blocked`
- `notes` — Nota interna

**Auditoría:** Cada cambio de estado genera un log en `AuditLog`.

---

#### `DELETE /api/[tenant]/loyalty/members/[id]`

Elimina un miembro permanentemente.

**Auditoría:** Log de eliminación con nombre y teléfono.

---

### 4.3 Estadísticas

#### `GET /api/[tenant]/loyalty/stats`

Estadísticas del club para el período seleccionado.

**Query Parameters:**
- `days` — Período en días (default: 30, máx: 365)

**Response:**
```json
{
  "overview": {
    "total": 45,
    "active": 40,
    "inactive": 4,
    "blocked": 1,
    "returningRate": 68
  },
  "bySource": {
    "checkout": 20,
    "qr_scan": 15,
    "admin": 5,
    "manual_import": 5
  },
  "recentMembers": [...],
  "topSpenders": [...],
  "period": {
    "days": 30,
    "dateFrom": "2026-03-09T00:00:00Z"
  },
  "revenue": {
    "total": 250000,
    "fromMembers": 180000,
    "ordersFromMembers": 32,
    "memberShare": 72
  }
}
```

---

### 4.4 Configuración

#### `GET /api/[tenant]/loyalty/settings`

Obtiene la configuración actual del club.

**Response:**
```json
{
  "loyalty": {
    "enabled": true,
    "clubName": "Club La Pizzada",
    "welcomeMessage": "¡Bienvenido/a a nuestro club!...",
    "createdAt": "2026-03-01T00:00:00Z"
  },
  "plan": "buy"
}
```

---

#### `PUT /api/[tenant]/loyalty/settings`

Actualiza la configuración del club.

**Request:**
```json
{
  "enabled": true,
  "clubName": "Club Premium",
  "welcomeMessage": "¡Gracias por sumarte!"
}
```

**Notas:**
- Al activar por primera vez, se setea `createdAt`
- Se registra en auditoría cada cambio

---

### 4.5 Importación Masiva

#### `POST /api/[tenant]/loyalty/import`

Importa miembros desde CSV.

**Formatos aceptados:**
```csv
nombre,teléfono,email
Juan Pérez,+5491112345678,juan@mail.com
María García,+5491187654321,
```

**Headers válidos:**
- Nombre: `name`, `nombre`, `cliente`
- Teléfono: `phone`, `teléfono`, `telefono`, `celular`
- Email: `email`, `correo`, `mail`

**Lógica:**
1. Valida estructura del CSV
2. Deduplica por phoneHash
3. Ignora duplicados existentes
4. Inserta en batch

**Response:**
```json
{
  "imported": 25,
  "skipped": 3,
  "details": ["Juan Pérez (ya existe)"],
  "message": "25 miembros importados correctamente."
}
```

---

### 4.6 Exportación

#### `GET /api/[tenant]/loyalty/export`

Exporta miembros a CSV o JSON.

**Query Parameters:**
- `format` — `csv` (default) o `json`

**Headers del CSV:**
```
Nombre,Teléfono,Email,Estado,Fecha de ingreso,Fuente,Pedidos,Total gastado,Último pedido,Notas
```

**Seguridad:** Teléfono siempre maskizado.

---

## 5. Componentes UI

### 5.1 `components/admin/LoyaltyClubSettings.tsx`

Configuración del club en el panel admin.

**Props:**
```typescript
interface Props {
  tenantSlug: string
  initial?: {
    enabled: boolean
    clubName: string
    welcomeMessage: string
  }
}
```

**Funcionalidades:**
- Toggle para activar/desactivar
- Campo nombre del club
- Campo mensaje de bienvenida
- Muestra límites según plan

**Integración API:** `PUT /api/[tenant]/loyalty/settings`

---

### 5.2 `components/admin/LoyaltyManager.tsx`

Gestión completa de miembros del club.

**Props:**
```typescript
interface Props {
  tenantSlug: string
  canExport: boolean  // feature flag
}
```

**Funcionalidades:**
- Stats cards: total miembros, tasa recompra, ingresos, nuevos (30d)
- Lista con búsqueda en tiempo real
- Filtros por estado y fuente
- Paginación
- Tabla con acciones por dropdown
- Modal para agregar/editar miembro
- Dialog de importación CSV
- Botón de exportación (si `canExport`)

**Integración APIs:**
- `GET /api/[tenant]/loyalty/members`
- `POST /api/[tenant]/loyalty/members`
- `PATCH /api/[tenant]/loyalty/members/[id]`
- `DELETE /api/[tenant]/loyalty/members/[id]`
- `GET /api/[tenant]/loyalty/stats`
- `POST /api/[tenant]/loyalty/import`

---

### 5.3 Componentes UI Base Creados

Para soportar los componentes del club, se crearon:

| Componente | Ruta | Descripción |
|------------|------|-------------|
| Input | `components/ui/input.tsx` | Campo de texto estilizado |
| Label | `components/ui/label.tsx` | Label accesible (Radix) |
| Switch | `components/ui/switch.tsx` | Toggle (Radix) |
| Dialog | `components/ui/dialog.tsx` | Modal (Radix) |

---

## 6. Páginas

### `app/[tenant]/admin/club/page.tsx`

Página principal del club en el admin.

**Estructura:**
```
Club de Fidelización
├── LoyaltyClubSettings (configuración)
└── LoyaltyManager (gestión de miembros)
```

**Verificación de acceso:**
- Requiere sesión autenticada
- Verifica feature flag `loyaltyClub`
- Muestra mensaje de upgrade si el plan no incluye

---

## 7. Integración en Checkout

### `components/menu/CheckoutForm.tsx`

Se agregó el checkbox de registro al club en el formulario de checkout.

**Cambios realizados:**

1. **State adicional:**
```typescript
const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null)
const [joinClub, setJoinClub] = useState(false)
```

2. **Fetch de configuración:**
```typescript
useEffect(() => {
  // ...carga existente
  fetch(`/api/${tenantSlug}/loyalty/settings`)
    .then(r => r.json())
    .then(data => {
      if (data.loyalty?.enabled) {
        setLoyaltyConfig(data.loyalty)
      }
    })
}, [])
```

3. **UI del checkbox:**
```tsx
{loyaltyConfig?.enabled && (
  <label className="flex items-start gap-3 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50">
    <input
      type="checkbox"
      checked={joinClub}
      onChange={e => setJoinClub(e.target.checked)}
    />
    <div>
      <Star className="text-amber-500" />
      <span>Unirme a {loyaltyConfig.clubName}</span>
      <p>{loyaltyConfig.welcomeMessage}</p>
    </div>
  </label>
)}
```

4. **Envío con el pedido:**
```typescript
const orderRes = await fetch(`/api/${tenantSlug}/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    // ...campos existentes
    joinClub: joinClub && loyaltyConfig?.enabled,
  }),
})
```

---

### `app/api/[tenant]/orders/route.ts`

Al crear una orden con `joinClub: true`:

1. **Verifica condiciones:**
   - Plan incluye `loyaltyClub`
   - Club habilitado (`tenant.loyalty.enabled`)
   - Cliente tiene teléfono
   - No existe ya el miembro
   - No superó límite de miembros

2. **Crea el miembro:**
```typescript
await LoyaltyMember.create({
  tenantId:  tenant._id,
  name:      body.customer.name,
  phone:     body.customer.phone,
  email:     body.customer.email || '',
  phoneHash: hashPhone(body.customer.phone),
  status:    'active',
  source:    'checkout',
  cache: {
    totalOrders: 1,
    totalSpent:  total,
    lastOrderAt: new Date(),
    updatedAt:   new Date(),
  },
})
```

3. **Si ya existe:** No hace nada (el webhook actualizará la caché al aprobarse el pago)

---

## 8. Integración con Webhooks

### `app/api/webhooks/mercadopago/[tenant]/route.ts`

Cuando MercadoPago confirma un pago:

1. **Actualiza estado de la orden** a `confirmed`

2. **Actualiza caché del miembro:**
```typescript
if (order.customer?.phoneHash) {
  await LoyaltyMember.findOneAndUpdate(
    {
      tenantId:  tenant._id,
      phoneHash: order.customer.phoneHash,
      status:   'active',
    },
    {
      $inc: {
        'cache.totalOrders': 1,
        'cache.totalSpent':  order.total ?? 0,
      },
      $set: {
        'cache.lastOrderAt': new Date(),
        'cache.updatedAt':  new Date(),
      },
    },
    { session, upsert: false }
  )
}
```

**Nota:** Se usa `session` de mongoose para consistencia transaccional.

---

## 9. Seguridad y Privacidad

### Phone Hashing

Los teléfonos se hashean con SHA-256 antes de almacenarse:

```typescript
function hashPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  return crypto.createHash('sha256').update(normalized).digest('hex')
}
```

### Masking en UI

Los teléfonos se muestran como `****XXXX` (últimos 4 dígitos) en:
- Lista de miembros del admin
- Exportaciones CSV/JSON
- Detalle de miembro

### Rate Limiting

Registro público: 3 intentos por IP cada 10 minutos.

### Auditoría

Todas las acciones sensibles se loggean:
- Cambios de estado de miembros
- Eliminación de miembros
- Cambios en configuración del club

---

## 10. Fase 2 — Sistema de Puntos y Niveles

### Modelo Extendido

```typescript
loyalty: {
  points: number,  // Puntos acumulados
  tier: 'none' | 'bronze' | 'silver' | 'gold'
}
```

### Reglas de Puntos

| Acción | Puntos |
|--------|--------|
| Cada $100 gastados | 1 punto |
| Primera compra | 10 puntos bonus |
| Referral exitoso | 50 puntos |

### Niveles

| Nivel | Puntos requeridos | Beneficios |
|-------|-------------------|------------|
| Bronze | 0-99 | 1% de descuento |
| Silver | 100-299 | 3% de descuento |
| Gold | 300+ | 5% de descuento + acceso prioritario |

### Componentes Pendientes

- `components/admin/LoyaltyAnalytics.tsx` — Métricas avanzadas (solo plan full)
- Página pública del club para clientes
- Dashboard con puntos y progreso
- Sistema de recompensas automáticas

---

## 11. Pendientes

### Alta Prioridad

- [ ] Página pública de verificación QR para clientes
- [ ] Integrar generación de QR en la configuración del club
- [ ] Página de "Mi Club" para que clientes vean sus beneficios

### Media Prioridad (Fase 2)

- [ ] Sistema de puntos y niveles
- [ ] Dashboard de lealtad para clientes
- [ ] Beneficios por nivel configurables
- [ ] Analytics avanzados (solo plan full)
- [ ] Notificaciones push para miembros

### Baja Prioridad

- [ ] Programa de referidos
- [ ] Integración con email marketing
- [ ] Segmentación de miembros

---

## 12. Checklist de Implementación

### Fase 1 — Completada ✅

| Componente | Archivo | Estado |
|------------|---------|--------|
| Modelo LoyaltyMember | `models/LoyaltyMember.ts` | ✅ |
| Config en Tenant | `models/Tenant.ts` | ✅ |
| Feature flags | `lib/plans.ts` | ✅ |
| Schema actualizado | `lib/schemas.ts` | ✅ |
| API Registro POST | `app/api/[tenant]/loyalty/register/route.ts` | ✅ |
| API Registro GET | `app/api/[tenant]/loyalty/register/route.ts` | ✅ |
| API Listado | `app/api/[tenant]/loyalty/members/route.ts` | ✅ |
| API Crear miembro | `app/api/[tenant]/loyalty/members/route.ts` | ✅ |
| API Detalle | `app/api/[tenant]/loyalty/members/[id]/route.ts` | ✅ |
| API Actualizar | `app/api/[tenant]/loyalty/members/[id]/route.ts` | ✅ |
| API Eliminar | `app/api/[tenant]/loyalty/members/[id]/route.ts` | ✅ |
| API Stats | `app/api/[tenant]/loyalty/stats/route.ts` | ✅ |
| API Config GET | `app/api/[tenant]/loyalty/settings/route.ts` | ✅ |
| API Config PUT | `app/api/[tenant]/loyalty/settings/route.ts` | ✅ |
| API Import CSV | `app/api/[tenant]/loyalty/import/route.ts` | ✅ |
| API Export | `app/api/[tenant]/loyalty/export/route.ts` | ✅ |
| LoyaltyClubSettings | `components/admin/LoyaltyClubSettings.tsx` | ✅ |
| LoyaltyManager | `components/admin/LoyaltyManager.tsx` | ✅ |
| Club page | `app/[tenant]/admin/club/page.tsx` | ✅ |
| Nav item | `components/admin/AdminSidebar.tsx` | ✅ |
| Checkout checkbox | `components/menu/CheckoutForm.tsx` | ✅ |
| Order con joinClub | `app/api/[tenant]/orders/route.ts` | ✅ |
| Webhook cache | `app/api/webhooks/mercadopago/[tenant]/route.ts` | ✅ |
| UI Input | `components/ui/input.tsx` | ✅ |
| UI Label | `components/ui/label.tsx` | ✅ |
| UI Switch | `components/ui/switch.tsx` | ✅ |
| UI Dialog | `components/ui/dialog.tsx` | ✅ |
| Documentación | `TECNICAL/Royal.md` | ✅ |

---

*Documento creado: Abril 2026*
*Última actualización: Implementación completa de Fase 1*
