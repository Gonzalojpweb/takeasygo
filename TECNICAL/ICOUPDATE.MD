# Sistema Anti-Gaming: Ajuste Automático de Tiempos Estimados

**Documento Técnico — Fase 2 Implementation**  
**Fecha:** Abril 2026  
**Estado:** Implementado y listo para testing  

---

## 📋 Resumen Ejecutivo

Este documento describe la implementación completa del **sistema de ajuste automático de tiempos estimados basado en ICO**, diseñado específicamente para evitar que los restaurantes manipulen el algoritmo de ranking (gaming).

### Problema que Resuelve

Los restaurantes podrían intentar inflar artificialmente su `estimatedPickupTime` (ej: poner 60 min en lugar de 20) para siempre "cumplir" el tiempo y subir su ICO. Este sistema calcula el tiempo óptimo **exclusivamente a partir de datos operativos reales**, ignorando cualquier intento de manipulación manual.

---

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SISTEMA ANTI-GAMING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐     │
│  │   BACKEND       │     │   MIDDLEWARE     │     │   FRONTEND         │     │
│  │   (API/DB)      │     │   (Lógica)       │     │   (UI Admin)       │     │
│  └────────┬────────┘     └────────┬─────────┘     └────────┬────────────┘     │
│           │                         │                      │                  │
│  ┌────────▼────────┐    ┌─────────▼──────────┐   ┌───────▼────────┐         │
│  │ estimated-time   │    │ estimatedTimeEngine │   │ EstimatedTime  │         │
│  │ /route.ts        │◄───│ .ts                │   │ Optimizer.tsx  │         │
│  │ (API Endpoint)   │    │ (Motor calc)       │   │ (Componente UI)│         │
│  └────────┬────────┘    └─────────┬──────────┘   └───────┬────────┘         │
│           │                         │                      │                  │
│  ┌────────▼────────┐    ┌─────────▼──────────┐   ┌───────▼────────┐         │
│  │ useEstimatedTime │    │ Order timestamps   │   │ Admin Panel    │         │
│  │ Adjustment.ts   │    │ (auto-generated)   │   │ (Config UI)    │         │
│  │ (Hook auto)      │    │                    │   │                │         │
│  └────────┬────────┘    └────────────────────┘   └────────────────┘         │
│           │                                                                  │
│  ┌────────▼────────┐                                                       │
│  │ Cron Job /api/   │                                                       │
│  │ cron/adjust-     │                                                       │
│  │ estimated-times  │                                                       │
│  └──────────────────┘                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Archivos Implementados

### 1. Motor de Cálculo Estadístico

**Archivo:** `lib/estimatedTimeEngine.ts`  
**Líneas:** ~350  
**Propósito:** Core del sistema anti-gaming. Calcula el tiempo óptimo basado exclusivamente en timestamps automáticos.

#### Funciones Principales:

| Función | Propósito |
|---------|-----------|
| `calculateOptimalEstimatedTime()` | Calcula tiempo óptimo usando μ_TPP, σ_TPP, y margen de confianza |
| `applyOptimalEstimatedTime()` | Aplica el ajuste y guarda auditoría |
| `detectGamingAttempt()` | Detecta si un tiempo propuesto manualmente es sospechoso |
| `runAutomaticAdjustmentForTenant()` | Procesa todas las ubicaciones de un tenant (cron) |

#### Fórmula del Tiempo Óptimo:

```typescript
tiempo_óptimo = μ_TPP + margen_confianza

donde:
  μ_TPP = avg(readyAt - confirmedAt) [últimos 30 días, status ≠ cancelled]
  
  margen_confianza = max(3, min(15, base + (CV × μ_TPP × 0.5)))
  
  CV (Coeficiente de Variación) = σ_TPP / μ_TPP
  
  base = 3 minutos (mínimo absoluto)
  
Si n ≥ 30 (CLT válido):
  margen = 1.96 × SE (Standard Error) = 1.96 × (σ/√n)
```

#### Constantes Anti-Gaming:

```typescript
const MIN_SAMPLE_SIZE = 10;           // Mínimo pedidos para calcular
const CLT_THRESHOLD = 30;             // Aplica Teorema del Límite Central
const MAX_CONFIDENCE_MARGIN = 15;     // Máximo margen: 15 min
const MIN_CONFIDENCE_MARGIN = 3;      // Mínimo margen: 3 min
const MAX_TIME_ALLOWED = 60;          // Límite físico superior
const MIN_TIME_ALLOWED = 5;           // Límite físico inferior
const ADJUSTMENT_DAMPING = 0.7;       // Suavizado anti-oscilación
```

#### Interfaz de Resultado:

```typescript
interface TimeCalculationResult {
  estimatedMinutes: number;      // Tiempo final mostrado al cliente
  muTPP: number;                 // μ_TPP: tiempo promedio real
  sigmaTPP: number;              // σ_TPP: desviación estándar
  sampleSize: number;            // n: pedidos usados
  confidenceMargin: number;        // Margen aplicado
  confidenceLevel: 'low'|'medium'|'high';  // Nivel de confianza estadística
  method: 'auto_optimized' | 'default_fallback' | 'manual_override_blocked';
  calculatedAt: Date;
  icoScoreAtCalc: number | null;
}
```

---

### 2. Hook de Ajuste Automático

**Archivo:** `lib/hooks/useEstimatedTimeAdjustment.ts`  
**Líneas:** ~120  
**Propósito:** Ejecuta ajustes automáticos en background cuando se completan pedidos.

#### Funciones:

| Función | Descripción |
|---------|-------------|
| `maybeAdjustEstimatedTime()` | Evalúa si debe ajustar (cooldown + diferencia significativa) |
| `triggerBackgroundAdjustment()` | Wrapper fire-and-forget para no bloquear HTTP |

#### Política de Cooldown:

```typescript
const DEFAULT_OPTIONS = {
  minNewOrders: 5,        // Mínimo pedidos nuevos desde último ajuste
  cooldownHours: 1        // No ajustar más de una vez por hora
};
```

#### Checks Anti-Gaming:

1. **Cooldown Check**: Verifica si pasó al menos 1 hora desde el último ajuste
2. **Datos Suficientes**: Requiere n ≥ 10 pedidos
3. **Diferencia Significativa**: Solo ajusta si cambio > 2 minutos
4. **Suavizado**: Aplica damping para evitar oscilaciones bruscas

---

### 3. API Endpoint

**Archivo:** `app/api/[tenant]/locations/[locationId]/estimated-time/route.ts`  
**Líneas:** ~220  
**Métodos:** GET, POST, PATCH

#### GET — Obtener Cálculo (Solo Lectura)

```http
GET /api/{tenant}/locations/{locationId}/estimated-time
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "current": 20,
  "calculated": {
    "estimatedMinutes": 18,
    "muTPP": 12.5,
    "sigmaTPP": 3.2,
    "sampleSize": 47,
    "confidenceMargin": 5.5,
    "confidenceLevel": "high",
    "method": "auto_optimized",
    "calculatedAt": "2026-04-26T03:30:00Z",
    "icoScoreAtCalc": 82
  },
  "canApply": true,
  "gamingWarning": null
}
```

#### POST — Forzar Ajuste (Admin Only)

```http
POST /api/{tenant}/locations/{locationId}/estimated-time
Authorization: Bearer {token}
Content-Type: application/json

{
  "force": true  // Opcional: ignora suavizado
}
```

**Validaciones:**
- Requiere rol `admin` o `superadmin`
- Rechaza si `method === 'default_fallback'` (datos insuficientes)
- Registra en `adjustmentHistory` con auditoría completa

#### PATCH — Validar Propuesta Manual (Anti-Gaming Detection)

```http
PATCH /api/{tenant}/locations/{locationId}/estimated-time
Authorization: Bearer {token}
Content-Type: application/json

{
  "estimatedPickupTime": 45
}
```

**Detección de Gaming:**

```typescript
// Detecta si el tiempo propuesto es sospechoso
const diffPercent = Math.abs(proposed - calculated) / calculated * 100;

if (diffPercent > 50 && proposed > calculated) {
  // Restaurant quiere poner tiempo MAYOR al recomendado
  // → Posible intento de "nunca fallar" el cumplimiento
  return {
    isSuspicious: true,
    reason: "El tiempo propuesto es 50%+ mayor al calculado...",
    allowed: false
  };
}

if (diffPercent > 30 && proposed < calculated) {
  // Restaurant quiere poner tiempo MENOR al recomendado  
  // → Posible intento de aparecer "más rápido"
  return {
    isSuspicious: true,
    reason: "El tiempo propuesto es 30%+ menor al calculado...",
    allowed: false
  };
}
```

---

### 4. Componente UI (Admin)

**Archivo:** `components/admin/EstimatedTimeOptimizer.tsx`  
**Líneas:** ~400  
**Framework:** React + TypeScript + Tailwind + shadcn/ui

#### Features:

- **Visualización del cálculo estadístico**: Muestra μ_TPP, σ_TPP, margen, n
- **Comparación visual**: Tiempo actual vs. calculado con diferencia porcentual
- **Advertencias de gaming**: Alerta si la diferencia es > 20%
- **Indicador de confianza**: Badge con nivel (low/medium/high) y explicación CLT
- **Historial de ajustes**: Últimos 5 ajustes con auditoría
- **Panel anti-gaming**: Explicación de protecciones activas

#### Estados UI:

```
┌─────────────────────────────────────────────────────────────┐
│  🛡️ Protección Anti-Gaming Activa                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Tiempo actual: 20 min                                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Tiempo calculado óptimo: 18 min  [Alta confianza]     │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  μ_TPP = 12.5 min (tiempo promedio real)              │  │
│  │  σ_TPP = 3.2 min (variabilidad)                       │  │
│  │  Margen = +5.5 min (cubre variabilidad)               │  │
│  │  Muestra = 47 pedidos (CLT válido)                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [Ajustar a 18 minutos]                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. Cron Job Diario

**Archivo:** `app/api/cron/adjust-estimated-times/route.ts`  
**Líneas:** ~80  
**Ejecución:** Programado (ej: 3:00 AM diario)

#### Funcionalidad:

- Procesa **todos los tenants activos**
- Para cada tenant, ajusta **todas sus ubicaciones**
- Ejecuta `runAutomaticAdjustmentForTenant()`
- Retorna resumen con estadísticas

#### Autorización:

```typescript
const CRON_SECRET = process.env.CRON_SECRET;
// Requiere header: Authorization: Bearer {CRON_SECRET}
```

#### Respuesta:

```json
{
  "success": true,
  "timestamp": "2026-04-26T03:00:00Z",
  "summary": {
    "tenants": 15,
    "locationsProcessed": 23,
    "locationsAdjusted": 7,
    "errors": 0
  },
  "details": [
    {
      "tenantSlug": "burger-king-avellaneda",
      "tenantName": "Burger King Avellaneda",
      "processed": 2,
      "adjusted": 1,
      "errors": 0
    }
  ]
}
```

---

## 🗄️ Modificaciones a Modelos

### Location Schema (`models/Location.ts`)

#### Nuevo Campo: `adjustmentHistory`

```typescript
settings: {
  acceptsOrders: boolean;
  orderModes: ('takeaway' | 'dine-in')[];
  estimatedPickupTime: number;
  
  // NUEVO: Auditoría anti-gaming
  adjustmentHistory?: Array<{
    previousValue: number;           // Valor anterior
    newValue: number;                // Nuevo valor aplicado
    reason: string;                  // Explicación del ajuste
    icoScore: number | null;         // ICO en momento del ajuste
    sampleSize: number;              // Pedidos usados para cálculo
    triggeredBy: 'cron' | 'order_completed' | 'admin_request' | 'system_init';
    timestamp: Date;
  }>;
}
```

#### Mongoose Schema:

```typescript
adjustmentHistory: {
  type: [{
    previousValue: { type: Number, required: true },
    newValue: { type: Number, required: true },
    reason: { type: String, required: true },
    icoScore: { type: Number, default: null },
    sampleSize: { type: Number, required: true },
    triggeredBy: {
      type: String,
      enum: ['cron', 'order_completed', 'admin_request', 'system_init'],
      required: true
    },
    timestamp: { type: Date, default: Date.now }
  }],
  default: []
}
```

**Límite:** Se mantienen solo los últimos 50 registros (optimización).

---

## 🔄 Integración en Flujo de Órdenes

### Modificación: Status Update Endpoint

**Archivo:** `app/api/[tenant]/orders/[orderId]/status/route.ts`

#### Trigger Automático:

Cuando un pedido cambia a estado `delivered`, se ejecuta automáticamente el ajuste de tiempo en background:

```typescript
// ── Trigger ajuste automático de tiempo estimado (anti-gaming) ───────────
if (status === 'delivered') {
  triggerBackgroundAdjustment(
    order.locationId.toString(), 
    tenant._id.toString()
  );
}
```

**Características:**
- Ejecuta en background (fire-and-forget)
- No bloquea la respuesta HTTP
- Aplica cooldown de 1 hora automáticamente
- Solo ajusta si hay diferencia significativa (>2 min)

---

## 🛡️ Medidas Anti-Gaming Detalladas

### 1. Inmutabilidad de Datos Operativos

| Dato | Origen | Editable por Restaurante |
|------|--------|--------------------------|
| `confirmedAt` | Timestamp automático al confirmar pedido | ❌ No |
| `readyAt` | Timestamp automático al marcar "listo" | ❌ No |
| `deliveredAt` | Timestamp automático al entregar | ❌ No |
| μ_TPP | Calculado: avg(readyAt - confirmedAt) | ❌ No |
| σ_TPP | Calculado: stdDev(readyAt - confirmedAt) | ❌ No |

### 2. Detección de Intentos de Manipulación

```typescript
// Intentos detectados:

// A) Inflar tiempo para "nunca fallar"
if (proposedTime > calculatedTime * 1.5) {
  block("Posible intento de manipular cumplimiento de tiempos");
}

// B) Deflacionar tiempo para aparecer "más rápido"
if (proposedTime < calculatedTime * 0.7) {
  block("Posible intento de aparecer más rápido de lo real");
}

// C) Cambios manuales frecuentes
if (history.length > 5 && ultimaHora) {
  warn("Múltiples cambios manuales detectados");
}
```

### 3. Cooldown y Rate Limiting

```typescript
// Entre ajustes automáticos: 1 hora mínimo
const hoursSinceLast = (now - lastAdjustment) / (1000 * 60 * 60);
if (hoursSinceLast < 1) return "Cooldown activo";

// Cambio máximo por iteración: 30%
const maxChange = current * 0.3;
if (Math.abs(change) > maxChange) {
  newValue = current + (sign(change) * maxChange);  // Suavizado
}
```

### 4. Límites Físicos Absolutos

```typescript
// Evita valores absurdos
if (time < 5)  return "Mínimo 5 minutos físicamente imposible";
if (time > 60) return "Máximo 60 minutos (contactar soporte si necesita más)";
```

### 5. Margen de Confianza Dinámico

```typescript
// Restaurante variable → margen mayor (más conservador)
// Restaurante estable → margen menor (más competitivo)

CV = σ / μ  // Coeficiente de Variación

if (CV < 0.1)  // Muy estable
  margen = 3 min;
else if (CV < 0.3)  // Estable
  margen = 5 min;
else  // Variable
  margen = min(15, 5 + CV * μ * 0.5);
```

---

## 📊 Fórmulas Matemáticas

### 1. Tiempo Promedio Real (μ_TPP)

```
μ_TPP = (1/n) × Σ(readyAtᵢ - confirmedAtᵢ) para i = 1..n

n = pedidos completados últimos 30 días (status ≠ cancelled)
Unidad: minutos
```

### 2. Desviación Estándar (σ_TPP)

```
σ_TPP = √[ (1/n) × Σ((readyAtᵢ - confirmedAtᵢ) - μ_TPP)² ]

Usa $stdDevPop (poblacional) porque son TODOS los pedidos del período,
no una muestra de población mayor.
```

### 3. Coeficiente de Variación (CV)

```
CV = σ_TPP / μ_TPP

Interpretación:
  CV < 0.1  → Muy estable (excelente)
  CV < 0.2  → Estable (bueno)
  CV < 0.3  → Aceptable
  CV > 0.3  → Variable (necesita mejora)
```

### 4. Margen de Confianza

```
// Caso A: n < 30 (sin CLT)
margen = max(3, min(15, 5 + CV × μ × 0.5))

// Caso B: n ≥ 30 (CLT válido, IC 95%)
SE = σ / √n              // Standard Error
margen = 1.96 × SE       // Intervalo de Confianza 95%
margen = max(3, min(15, margen))
```

### 5. Tiempo Estimado Óptimo

```
time_optimal = round(μ_TPP + margen)

// Aplicar límites físicos
time_optimal = max(5, min(60, time_optimal))

// Aplicar suavizado (anti-oscilación)
if (!forceRecalc && n ≥ 30) {
  maxChange = current × 0.3;
  if |time_optimal - current| > maxChange {
    time_optimal = current + sign(time_optimal - current) × maxChange;
  }
}
```

---

## 🧪 Testing y Validación

### Escenarios de Prueba

#### Escenario 1: Restaurante Estable (Alto ICO)

```
Datos últimos 30 días:
  - Pedidos: 45
  - Tiempos: 12, 13, 11, 12, 14, 12, 11, 13, 12, 12... min
  
Cálculo:
  μ_TPP = 12.2 min
  σ_TPP = 0.9 min
  CV = 0.07 (muy estable)
  margen = 3 min (CV < 0.1)
  
Resultado: 15 min estimado (12.2 + 3)
```

#### Escenario 2: Restaurante Variable (ICO Medio)

```
Datos últimos 30 días:
  - Pedidos: 28
  - Tiempos: 8, 25, 12, 30, 10, 22, 15, 28... min
  
Cálculo:
  μ_TPP = 18.5 min
  σ_TPP = 8.2 min
  CV = 0.44 (muy variable)
  margen = min(15, 5 + 0.44 × 18.5 × 0.5) = 9 min
  
Resultado: 28 min estimado (18.5 + 9)
```

#### Escenario 3: Intento de Gaming (Detectado)

```
Calculado: 18 min
Propuesto por restaurante: 45 min

Diferencia: (45 - 18) / 18 = 150% mayor

Detección:
  150% > 50% threshold → GAMING DETECTED
  
Respuesta API:
  {
    "allowed": false,
    "isSuspicious": true,
    "reason": "El tiempo propuesto (45min) es 150% mayor al calculado...",
    "recommendedTime": 18
  }
```

---

## 🔐 Seguridad y Auditoría

### Registro de Ajustes

Cada ajuste queda registrado permanentemente:

```json
{
  "previousValue": 20,
  "newValue": 18,
  "reason": "μ_TPP=12.5min, σ_TPP=3.2min | n=47 pedidos | margen=5.5min | ICO=82",
  "icoScore": 82,
  "sampleSize": 47,
  "triggeredBy": "order_completed",
  "timestamp": "2026-04-26T03:30:00Z"
}
```

### Trail de Auditoría

- **Quién**: Sistema automático (cron/delivered) o Admin (manual)
- **Qué**: Valor anterior → nuevo valor
- **Por qué**: Razón estadística detallada
- **Cuándo**: Timestamp exacto
- **Contexto**: ICO, muestra, método de cálculo

---

## 🚀 Deployment y Configuración

### Variables de Entorno

```bash
# Para cron job
CRON_SECRET=suDFEG85seBDCF8tYGSTXYZDTWYS8HSU

# Ya existentes (requeridas)
MONGODB_URI=
NEXTAUTH_SECRET=
```

### Configuración de Cron (Vercel)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/adjust-estimated-times",
      "schedule": "0 3 * * *"  // 3:00 AM daily
    }
  ]
}
```

### Migración de Datos

No requiere migración. El campo `adjustmentHistory` tiene default `[]`.

---

## 📈 Integración con ICO

### Relación ICO ↔ Tiempo Estimado

```
┌────────────────────────────────────────────────────────────┐
│                    FEEDBACK LOOP                            │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────┐        ┌─────────────────────┐         │
│   │  Pedidos     │───────►│  Timestamps auto    │         │
│   │  Completados │        │  (confirmed→ready)  │         │
│   └──────────────┘        └──────────┬──────────┘         │
│                                       │                     │
│   ┌──────────────┐        ┌───────────▼──────────┐         │
│   │  Tiempo      │◄───────│  Cálculo estadístico │         │
│   │  Estimado   │        │  (μ_TPP, σ_TPP)      │         │
│   │  Óptimo     │        └───────────┬──────────┘         │
│   └──────┬───────┘                  │                     │
│          │                          │                     │
│          │                 ┌────────▼────────┐            │
│          │                 │  Componentes ICO │            │
│          │                 │  • Consistencia   │            │
│          │                 │  • Cumplimiento   │            │
│          │                 │  • (25%, 30%)    │            │
│          │                 └────────┬────────┘            │
│          │                          │                     │
│          └──────────────────────────┘                     │
│                   Ajusta automáticamente                  │
│                   el benchmark para                       │
│                   cumplimiento de tiempos                 │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Impacto en Componentes ICO

| Componente ICO | Peso | Relación con Tiempo Estimado |
|----------------|------|------------------------------|
| Consistencia TPP | 25% | Directa: usa σ_TPP/μ_TPP del mismo cálculo |
| Cumplimiento Tiempos | 30% | El tiempo estimado ES el benchmark para medir cumplimiento |

---

## ✅ Checklist de Implementación

- [x] Motor de cálculo estadístico (`estimatedTimeEngine.ts`)
- [x] Hook de ajuste automático (`useEstimatedTimeAdjustment.ts`)
- [x] API Endpoint con GET/POST/PATCH
- [x] Componente UI Admin (`EstimatedTimeOptimizer.tsx`)
- [x] Cron job diario masivo
- [x] Modificación schema Location (adjustmentHistory)
- [x] Integración en flujo de órdenes (trigger on delivered)
- [x] Detección de intentos de gaming (PATCH validation)
- [x] Auditoría completa de ajustes
- [x] Límites físicos anti-absurdo (5-60 min)
- [x] Cooldown entre ajustes (1h)
- [x] Suavizado anti-oscilación (30% max change)
- [x] CLT aplicado cuando n≥30 (IC 95%)

---

## 📝 Notas Técnicas

### Por qué $stdDevPop en lugar de $stdDevSamp

Usamos desviación estándar poblacional porque estamos midiendo **toda la población de pedidos del período** (30 días), no una muestra de una población mayor. Esto da una medida más precisa de la variabilidad real del restaurante.

### Por qué Cooldown de 1 Hora

Evita que un restaurante intente "spamear" pedidos pequeños para cambiar rápidamente el tiempo estimado. Con el cooldown, se necesitaría mantener el comportamiento durante días para ver un cambio significativo.

### Por qué Margen Mínimo de 3 Minutos

Incluso el restaurante más rápido y estable tiene alguna variabilidad inherente (un ingrediente que se acabó, un cliente que hace una pregunta, etc.). El margen de 3 min cubre esta variabilidad mínima.

---

**Documento versión 1.0 — TakeasyGO Technical Team**
