# TakeasyGO — Pitch Técnico / Brochure de Producto

**Versión:** Marzo 2026  
**Contacto:** [gonza@takeasygo.com]

---

## El problema que resolvemos

El takeaway está desorganizado.

Los clientes no saben qué restaurantes aceptan retiro en local, cuánto tarda, si están cerca, ni si pueden pedir sin apps de delivery.

Los restaurantes no tienen infraestructura propia. Dependen de marketplaces que les cobran comisiones altas, los invisibilizan si no pagan por visibilidad y no les dejan ningún dato de sus clientes.

**El problema no es el delivery. Es que el takeaway nunca tuvo su propia plataforma.**

---

## Qué es TakeasyGO

TakeasyGO es una plataforma SaaS multi-tenant para restaurantes que venden takeaway (retiro en local).

Tiene dos capas:

### Capa 1 — Infraestructura (hoy)

Un sistema completo para que cada restaurante tenga:
- Menú digital propio con su marca
- Sistema de pedidos online
- Pagos integrados (MercadoPago)
- Panel de administración
- Analytics e inteligencia operativa

El restaurante vende directo. Sin intermediarios. Con sus datos.

### Capa 2 — Red TakeasyGO (futuro)

Cuando hay suficientes restaurantes en el sistema, se construye una **red de takeaway** basada en datos reales:
- Radar de restaurantes cercanos
- Visibilidad por capacidad operativa real (no por publicidad pagada)
- Descubrimiento por proximidad, tiempo real y confiabilidad

---

## Fundamentos conceptuales

TakeasyGO no es solo una app. Está construido sobre principios académicos y de ingeniería:

**Ley de Goodhart (Charles Goodhart)**
Si el algoritmo mide "tiempo de preparación", el restaurante puede mentir en el estado del pedido para optimizar la métrica. TakeasyGO mide timestamps reales, consistencia y desviación. No lo que el restaurante declara — lo que el sistema registra.

**Teorema Central del Límite**
Usamos mínimo 30 pedidos para considerar estadísticamente válido el Índice Operativo (ICO). Estándar de Six Sigma y análisis industrial.

**Restaurant Revenue Management (Cornell University — Sheryl E. Kimes)**
En lugar de aceptar pedidos hasta colapsar (el error de las apps actuales), aplicamos throttling: control de flujo que protege la operación bajo carga.

**Ciudad de los 15 minutos (Carlos Moreno)**
El modelo de red futura está inspirado en el concepto de hiperlocal: el comercio de proximidad como eje del ecosistema urbano.

---

## Funcionalidades actuales (Fase 1 — operativa)

### Menú Digital
- Categorías, ítems, imágenes, precios, descripciones
- Customizaciones por ítem (tamaños, extras, salsas — opciones únicas o múltiples, con precio adicional)
- Tags visuales (vegano, sin gluten, etc.)
- Disponibilidad programada por horario y día
- Branding completo del restaurante (colores, logo, tipografía, layout)
- Menú bilingüe español/inglés con traducción automática por IA
- Modo takeaway y dine-in (QR de mesa)

### Pedidos y Pagos
- Flujo completo: menú → carrito → checkout → pago → tracking → retiro
- Integración con MercadoPago (preferencias de pago, webhooks HMAC, credenciales cifradas AES-256)
- Número de orden único (ej: REST-20260305-001)
- Tracking en tiempo real con estados: pendiente → confirmado → preparando → listo → entregado
- QR en pantalla de éxito para mostrar en caja

### Panel de Administración
- Vista en tiempo real de órdenes activas
- Cambio de estado con timestamps automáticos
- Historial completo con búsqueda y filtros
- Impresión automática de tickets en cocina (impresoras térmicas ESC/POS, protocolo TCP/IP)
- Múltiples impresoras por local con roles diferenciados (cocina, barra, caja)
- Múltiples sucursales por restaurante
- Gestión de equipo con 5 roles (admin, gerente, staff, cajero, superadmin)
- Log de auditoría completo (quién hizo qué, cuándo, desde qué IP)
- Exportación de reportes en Excel y PDF

### Seguridad
- Login con bcrypt + rate limit (5 intentos / 60 segundos)
- JWT de 8 horas con recuperación de contraseña vía token SHA-256 de un solo uso
- Rate limiting con Upstash Redis (anti-fuerza bruta en login, órdenes y pagos)
- Headers HTTP de seguridad (HSTS, X-Frame-Options)
- Validación de inputs con Zod en todas las APIs

---

## ICO — Índice de Consistencia Operativa

**El corazón diferencial de TakeasyGO.**

El ICO es un score propio (0 a 100) que mide la salud operativa real de cada restaurante. No mide popularidad ni estrellas — mide estabilidad.

```
ICO =
  Consistencia de tiempos de preparación  × 25%
  Cumplimiento de tiempos estimados       × 30%
  Baja tasa de cancelación                × 20%
  Actividad sostenida                     × 15%
  Estabilidad horaria                     × 10%
```

| Rango | Estado |
|-------|--------|
| 91–100 | Alta consistencia operativa ✅ |
| 76–90  | Operación estable 🟢 |
| 51–75  | En consolidación 🟡 |
| 0–50   | Ajustes necesarios 🔴 |

**Para qué sirve:**
- Diagnóstico interno del restaurante
- Ajuste automático de tiempos estimados (Fase 2)
- Criterio de ingreso a la Red TakeasyGO (Fase 3)
- Identificar problemas antes de que exploten

El ICO usa el Teorema del Límite Central: con n ≥ 30 pedidos, calcula el Intervalo de Confianza al 95% del tiempo de preparación. Estadística industrial aplicada a gastronomía.

---

## Upselling Inteligente

TakeasyGO tiene un sistema de sugerencias automáticas que aparece en dos momentos del pedido:

**Momento 1:** después de que el cliente agrega un producto al carrito, aparece un bottom sheet con 1 o 2 sugerencias complementarias.

**Momento 2:** antes del pago, un banner con productos destacados que el cliente aún no agregó.

El sistema usa tres capas de inteligencia en orden de prioridad:

| Nivel | Qué hace | Disponible desde |
|-------|----------|-----------------|
| Manual | El dueño configura qué sugerir con cada producto | Día 1 |
| Comportamental | Analiza co-ocurrencia en los últimos 90 días y aprende solo | Con historial |
| Estático (precio) | Sugiere productos destacados de bajo precio a quien compra algo caro | Día 1 (fallback) |

**Impacto estimado en ticket promedio:**

| Tipo de negocio | Aumento estimado |
|-----------------|-----------------|
| Hamburguesería | +12% a +18% |
| Pizzería | +8% a +15% |
| Restaurante casual | +10% a +20% |
| Cafetería / Sandwichería | +15% a +25% |

El plan Premium incluye analytics de upselling: tasa de conversión por producto sugerido, revenue atribuible al upselling y ranking por fuente.

---

## Planes y Precios

| | Trial | Inicial | Crecimiento | Premium |
|---|:---:|:---:|:---:|:---:|
| **Precio** | Gratis | USD 30/mes | USD 50/mes | USD 80/mes |
| **Pedidos** | Hasta 30 | Ilimitados | Ilimitados | Ilimitados |
| **Sedes** | 1 | 1 | Ilimitadas | Ilimitadas |
| **Usuarios con roles** | — | — | ✓ | ✓ |
| **Impresoras** | 1 | 1 | Ilimitadas | Ilimitadas |
| **Reportes de ventas** | — | — | Básicos | Avanzados + KPIs |
| **Upselling inteligente** | ✓ | ✓ | ✓ | ✓ + Analytics |
| **ICO** | Al cierre del trial | — | Simplificado | Avanzado completo |
| **Modo Dine-in** | — | — | — | ✓ |
| **Exportación Excel/PDF** | — | — | ✓ | ✓ |

### Plan Trial
Los primeros 30 pedidos son gratuitos. Al completarlos, el sistema genera automáticamente el **ICO de contexto operativo**: un diagnóstico inicial de la operación del restaurante para que tome decisiones informadas al elegir su plan.

### Modelo de comisión por orden (futuro)
Inspirado en OrderYoyo. Cuanto más vende el restaurante, menos paga:

| Nivel | Órdenes/mes | Comisión |
|-------|------------|---------|
| 1 | Hasta 300 | 9% |
| 2 | 300–600 | 8% |
| 3 | 600–1.000 | 7% |
| 4 | 1.000–2.000 | 6% |
| 5 | +2.000 | 5% |

---

## Arquitectura técnica

| Capa | Tecnología |
|------|-----------|
| Frontend / App | Next.js 14 App Router (Server + Client Components) |
| Base de datos | MongoDB Atlas (multi-tenant, aislado por `tenantId`) |
| Autenticación | NextAuth.js con JWT |
| Pagos | MercadoPago (preferencias, webhooks, HMAC) |
| Rate limiting | Upstash Redis |
| Email | SMTP / Nodemailer |
| Impresoras | ESC/POS vía TCP/IP al puerto 9100 |
| Hosting | Vercel |
| UI | Tailwind CSS + Lucide Icons + Framer Motion |
| Exports | ExcelJS + jsPDF |

**Multi-tenant real:** cada restaurante es un tenant completamente aislado. Toda query incluye `tenantId` como primer filtro. Un restaurante nunca puede ver datos de otro.

---

## Roadmap

### Fase 1 — SaaS (operativa hoy)
Infraestructura digital completa para el restaurante. 10 a 30 restaurantes activos como objetivo inicial.

### Fase 2 — Inteligencia Operativa
- Ajuste automático de tiempos estimados basado en ICO en tiempo real
- Score de capacidad (cuántos pedidos puede absorber el restaurante ahora)
- Predicción de demanda por hora

### Fase 3 — Red TakeasyGO
- Radar de restaurantes cercanos para el consumidor final
- Algoritmo de visibilidad basado en datos reales (no en publicidad):

```
VisibilityScore =
  35% × distancia real al usuario
  30% × tiempo estimado de preparación
  20% × capacidad operativa actual
  15% × score ICO histórico
```

El restaurante más visible no es el que paga más — es el que mejor opera en ese momento.

### Fase 4 — Red completa
Descubrimiento público. El consumidor encuentra takeaway por calidad operativa real, en su radio de proximidad.

---

## Por qué TakeasyGO es diferente

| Apps actuales | TakeasyGO |
|--------------|-----------|
| Venden visibilidad | Visibilidad por mérito operativo |
| El que paga aparece primero | El que mejor funciona aparece primero |
| Datos del cliente son del marketplace | Los datos son del restaurante |
| Alta comisión fija | Comisión decreciente por volumen |
| Score social (estrellas, reviews) | Score operativo interno (ICO) |
| Orientado al delivery | Infraestructura nativa de takeaway |

---

## Estado actual del proyecto

| Módulo | Estado |
|--------|--------|
| Menú digital completo | ✅ Productivo |
| Pedidos + pagos MercadoPago | ✅ Productivo |
| Panel de administración | ✅ Productivo |
| Impresoras térmicas | ✅ Productivo |
| Usuarios y roles | ✅ Productivo |
| Auditoría | ✅ Productivo |
| Reportes básicos y avanzados | ✅ Productivo |
| ICO — Índice de Consistencia Operativa | ✅ Productivo |
| Upselling inteligente (3 capas) | ✅ Productivo |
| Analytics de upselling (Premium) | ✅ Productivo |
| Radar / Red TakeasyGO | 🔜 Fase 3 |
| Ajuste automático por ICO | 🔜 Fase 2 |

---

## En una frase

> TakeasyGO es la infraestructura que los restaurantes de takeaway no tenían: menú digital propio, pedidos con datos reales, score operativo que mide consistencia (no popularidad), y upselling automático. Todo construido para que cuando la red escale, los que mejor operan sean los más visibles.

---

*TakeasyGO · 2026*
