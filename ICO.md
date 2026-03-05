# ICO — Índice de Consistencia Operativa

**Versión:** 1.0 · Marzo 2026
**Estado en proyecto:** ✅ Implementado

---

## I. Qué es el ICO

El ICO es un índice interno que mide la salud estructural de un restaurante dentro del sistema TakeasyGO.

- **No** es una calificación pública
- **No** son estrellas
- **No** es reputación social
- **Es** estabilidad operativa — diagnóstico interno

### Para qué sirve

- Ajustar tiempos estimados automáticamente
- Detectar desorden antes de que explote
- Determinar si un restaurante está listo para escalar
- En el futuro: habilitar pertenencia a red (criterio de entrada Fase 2)

---

## II. Fórmula ICO

Escala de 0 a 100.

```
ICO =
  (Consistencia_TPP      × 0.25) +
  (Cumplimiento_Tiempos  × 0.30) +
  (Baja_Cancelacion      × 0.20) +
  (Actividad_Sostenida   × 0.15) +
  (Estabilidad_Horaria   × 0.10)
```

### Componentes

| Variable | Fórmula | Peso |
|---|---|---|
| **Consistencia_TPP** | `1 - (σ_TPP / μ_TPP)` — coeficiente de variación invertido | ×0.25 |
| **Cumplimiento_Tiempos** | `% órdenes donde readyAt ≤ createdAt + estimatedPickupTime` | ×0.30 |
| **Baja_Cancelacion** | `1 - (canceladas / total_órdenes)` | ×0.20 |
| **Actividad_Sostenida** | `órdenes_últimos_7_días / promedio_semanal_del_mes` (cap 1) | ×0.15 |
| **Estabilidad_Horaria** | `días_activos_30d / 20` — proxy de regularidad | ×0.10 |

> Los fallbacks para componentes sin datos: Consistencia y Cumplimiento usan 0.5 (neutro).
> El ICO requiere mínimo **10 pedidos** en los últimos 30 días para calcularse.

---

## III. Bandas diagnósticas

| Rango | Estado | Color UI |
|---|---|---|
| 91–100 | Alta consistencia operativa | emerald-600 |
| 76–90  | Operación estable | emerald-500 |
| 51–75  | En consolidación | amber-500 |
| 0–50   | Ajustes necesarios | destructive (rojo) |

No hay premios. No hay "top". Solo estado.

---

## IV. Calidad de datos y Teorema del Límite Central

El CLT garantiza que la media del TPP (μ̂) sigue distribución normal cuando n ≥ 30,
lo que hace que el Standard Error y el IC 95% sean estadísticamente confiables.

| n (pedidos con TPP completo) | Calidad de datos | Comportamiento |
|---|---|---|
| n < 10 | `insuficiente` | ICO no se calcula |
| 10 ≤ n < 30 | `muestra_pequeña` | ICO se calcula con advertencia visual |
| n ≥ 30 | `valida` | CLT aplica — SE e IC 95% confiables |

### Fórmulas CLT

```
SE = σ / √n
IC 95% = μ ± 1.96 × SE     (solo cuando n ≥ 30)
```

> Se usa `$stdDevPop` porque medimos la **población real** de órdenes del período,
> no una muestra de una población mayor.

---

## V. Visual (diseño)

```
/[tenant]/admin/ico
─────────────────────────────────────────────
Header: "ICO — Índice de Consistencia Operativa"
Sub:    "Uso interno exclusivo · Últimos 30 días"

[Score Principal]
   ┌──────────────────────────────────────────┐
   │    82 / 100       Operación estable      │
   │   ●●●●●●●●○○    76–90 · verde           │
   └──────────────────────────────────────────┘

[5 Componentes]
  Consistencia del TPP     ×0.25   ████████░░  80%
  Cumplimiento de tiempos  ×0.30   ███████░░░  70%
  Baja cancelación         ×0.20   ██████████  95%
  Actividad sostenida      ×0.15   ████████░░  78%
  Estabilidad horaria      ×0.10   ███████░░░  72%

[Detalle TPP]
  μ: 18 min · σ: 4 min · n: 47
  SE: ±0.6 min · IC 95%: 16.9–19.1 min
  ✅ CLT válido (n ≥ 30)
```

---

## VI. Estado en el proyecto

| Elemento | Estado |
|---|---|
| Endpoint `GET /api/[tenant]/analytics/score` | ✅ Implementado |
| Widget ICO en `/admin` (dashboard) | ✅ Implementado |
| Página dedicada `/admin/ico` | ✅ Implementado |
| ICO en AdminSidebar | ✅ Implementado |
| Pesos correctos (Consistencia×0.25, Actividad×0.15) | ✅ Implementado |
| CLT: SE + IC 95% + dataQuality | ✅ Implementado |
| ICO en superadmin analytics | ⚠️ Parcial — datos de ecosistema sin renombrar |
| Uso en ajuste automático de tiempos | ❌ Fase 2 |
| Criterio de red (pertenencia) | ❌ Fase 2 |
