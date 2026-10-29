# 02-modulos-y-planes.md — Tabla de módulos con identificador y planes

## Leyenda
- `siempre_activo`: Módulo disponible en todos los planes (puede tener límites de uso).
- `opcional`: Módulo activado según el plan del negocio.
- `Plan`: `trial` → `try` → `buy` → `full` → `anfitrion`
- Identificador: Nombre exacto tal como aparece en `PLAN_ACCESS` de `packages/business/src/plans.ts`. **No cambiar ni traducir.**

---

| # | Módulo (identificador) | Tipo | Planes que lo habilitan | Notas |
|---|------------------------|------|-------------------------|-------|
| 1 | `menu` | siempre_activo | trial, try, buy, full, anfitrion | Menú digital completo. Siempre disponible, aunque plan trial/try/anfitrion tienen límites (1 sede; impresoras según plan). |
| 2 | `orders` | siempre_activo | trial, try, buy, full | Órdenes de venta. Bloqueado solo en plan anfitrion (no listed en PLAN_ACCESS para anfitrion, pero trial/try/buy/full sí). |
| 3 | `orderHistory` | siempre_activo | trial, try, buy, full | Historial de órdenes. |
| 4 | `printers` | opcional | trial, try, buy, full | Impresoras. Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4. |
| 5 | `settings` | siempre_activo | trial, try, buy, full, anfitrion | Configuración general. Trial/try = máximo 1 ubicación. |
| 6 | `reports` | opcional | buy, full | Reportes de ventas. Growth y Premium solo. |
| 7 | `users` | opcional | buy, full | Gestión de usuarios. Growth y Premium solo. |
| 8 | `audit` | opcional | buy, full | Log de auditoría de acciones del equipo. |
| 9 | `multiLocation` | opcional | buy, full | Múltiples sedes. Growth y Premium solo. |
| 10 | `multiPrinter` | opcional | buy, full | Múltiples impresoras por local. Growth y Premium solo. |
| 11 | `ico` | opcional | buy, full | Índice de Fiabilidad Operativa. buy = simplificado, full = avanzado. |
| 12 | `icoTrial` | opcional | trial | ICO de contexto al llegar a 30 pedidos (solo trial). |
| 13 | `analyticsAdv` | opcional | full | Analytics avanzado: performance + menú + horarios inteligentes. |
| 14 | `icoAdvanced` | opcional | full | ICO diagnóstico completo con factores. |
| 15 | `store` | opcional | full | Tienda de canje de puntos. Premium solo. |
| 16 | `sos` | opcional | buy, full | Sistema SOS (préstamo de puntos en checkout). |
| 17 | `dineIn` | siempre_activo | trial, try, buy, full, anfitrion | Modo dine-in (menú para consumo en el local). Siempre disponible. |
| 18 | `reservations` | opcional | buy, full | Gestión de reservas con pago de seña. Growth y Premium solo. |
| 19 | `inventory` | opcional | buy, full | Módulo TGO Inventory (insumos, recetas, consumo por venta). |
| 20 | `business` | opcional | buy, full | Módulo Business (precios corporativos / menús corporativos). |
| 21 | `loyaltyClub` | opcional | trial, try, buy, full | Club de Fidelización. Límites: trial=30, try=150, buy/full=ilimitado. Exportación lista solo desde buy/full. |
| 22 | `loyaltyExport` | opcional | buy, full | Exportación de lista de miembros del club. |
| 23 | `loyaltyAnalytics` | opcional | full | Analytics avanzados del club (Fase 2). |
| 24 | `posIntegration` | opcional | buy, full | Integración POS (Fudo / Bistrosoft / API). |
| 25 | `delivery` | opcional | trial, buy, full | Delivery con costo variable por zona. Trial, Crecimiento y Premium. |
| 26 | `adminPushNotifications` | opcional | trial, buy, full | Notificaciones push al admin cuando llega un pedido nuevo. Disponible en Trial, Crecimiento y Premium. |
| 27 | `tia` | opcional | buy, full | TIA — Inteligencia TakeasyGO. |
| 28 | `crm` | opcional | buy, full | CRM — Base de datos de consumidores. Crecimiento y Premium. |
| 29 | `cis` | opcional | buy, full | CIS — Customer Intelligence System. Métricas, segmentación, health score, insights, señales. |
| 30 | `transferPayment` | siempre_activo | trial, try, buy, full, anfitrion | Transferencia bancaria. Disponible en todos los planes. |
| 31 | `paymentSurcharges` | siempre_activo | trial, try, buy, full, anfitrion | Configuración de recargos por método de pago. Todos los planes. |
| 32 | `hiddenRewards` | opcional | buy, full | Recompensas Escondidas. Growth: hasta 20 premios por sede. Premium: ilimitado. |

---

### Modulos NO listados en PLAN_ACCESS pero presentes en el sistema

Los siguientes módulos existen en el código pero no aparecen en la matriz `PLAN_ACCESS`. Su estado depende de la arquitectura interna:

| Módulo | Estado | Comentario |
|--------|--------|------------|
| `cash-sale` (eventos cash-sale) | Siempre activo (infraestructura) | Componente del sync layer, no un "módulo de usuario". |
| `z-report` | Siempre activo (al cerrar caja) | Generado al cerrar caja, no depende de plan. |
| `pairing` | Siempre activo (infraestructura) | Emparejamiento de dispositivos hub/spoke. |
| `locations` | Siempre activo (infraestructura) | Gestión de sedes/ubicaciones. |
| `sso` | Siempre activo (infraestructura) | Single Sign On. |
| `delivery` (ruta API) | Siempre activo (infraestructura) | Endpoint de delivery, habilitado por plan. |
| `customers` | Siempre activo (infraestructura) | Gestión de clientes. |
| `internal` | Siempre activo (infraestructura) | Rutas internas server-to-server. |
| `health` | Siempre activo (infraestructura) | Health check. |