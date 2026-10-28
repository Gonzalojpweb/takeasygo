# Índice — Base de conocimiento del asistente de soporte TakEasyGo

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `00-indice.md` | Este mapa de documentación |
| 2 | `01-roles-y-permisos.md` | Matriz completa rol × módulo × acción |
| 3 | `02-modulos-y-planes.md` | Tabla de módulos con identificador y planes/flags |
| 4 | `03-glosario.md` | Términos de la plataforma |
| 5 | `04-flujos-comunes-por-rol.md` | Día a día de cada rol (apertura/cierre, alta de producto, etc.) |
| 6 | `05-errores-globales.md` | Errores generales (sesión, permisos, conexión, etc.) |
| 7 | `06-politica-del-asistente.md` | Política e instrucciones del asistente |
| 8 | `07-escalamiento-a-soporte.md` | Cuándo y cómo derivar a un humano |
| 9 | `08-preguntas-de-prueba.md` | Mínimo 60 preguntas realistas con respuesta y fuente |
| 10 | `09-pruebas-de-limites.md` | Casos adversariales mínimo 40 |
| 11 | `10-system-prompt-base.md` | Borrador del prompt de sistema del asistente |
| 12 | Módulo `menu` | Documentación completa del módulo de menú |
| 13 | Módulo `orders` | Documentación completa del módulo de órdenes |
| 14 | Módulo `orderHistory` | Documentación del historial de órdenes |
| 15 | Módulo `printers` | Documentación del módulo de impresoras |
| 16 | Módulo `settings` | Documentación de configuración |
| 17 | Módulo `reports` | Documentación de reportes |
| 18 | Módulo `users` | Documentación de gestión de usuarios |
| 19 | Módulo `audit` | Documentación de auditoría |
| 20 | Módulo `multiLocation` | Módulo de múltiples sedes |
| 21 | Módulo `multiPrinter` | Módulo de múltiples impresoras |
| 22 | Módulo `ico` | Documentación del Índice de Confiabilidad Operativa |
| 23 | Módulo `icoTrial` | Documentación del ICO en plan Trial |
| 24 | Módulo `analyticsAdv` | Documentación de analytics avanzado |
| 25 | Módulo `icoAdvanced` | Documentación de ICO avanzado |
| 26 | Módulo `store` | Documentación de tienda de canje |
| 27 | Módulo `sos` | Documentación del sistema SOS (préstamo de puntos) |
| 28 | Módulo `dineIn` | Documentación de consumo en el local |
| 29 | Módulo `reservations` | Documentación de reservas |
| 30 | Módulo `inventory` | Documentación de inventario e insumos |
| 31 | Módulo `business` | Documentación del módulo Business (precios corporativos) |
| 32 | Módulo `loyaltyClub` | Documentación del Club de Fidelización |
| 33 | Módulo `loyaltyExport` | Documentación de exportación del club |
| 34 | Módulo `loyaltyAnalytics` | Documentación de analytics del club |
| 35 | Módulo `posIntegration` | Documentación de integración POS |
| 36 | Módulo `delivery` | Documentación de delivery |
| 37 | Módulo `adminPushNotifications` | Documentación de notificaciones push al admin |
| 38 | Módulo `tia` | Documentación de TIA (Inteligencia TakeasyGO) |
| 39 | Módulo `crm` | Documentación de CRM (base de datos de consumidores) |
| 40 | Módulo `cis` | Documentación de CIS (Customer Intelligence System) |
| 41 | Módulo `transferPayment` | Documentación de transferencia bancaria |
| 42 | Módulo `paymentSurcharges` | Documentación de recargos por método de pago |
| 43 | Módulo `hiddenRewards` | Documentación de recompensas ocultas |

---

**Nota importante:** Los identificadores exactos del sistema (a usar como puente entre la app y el asistente) vienen definidos en `packages/business/src/plans.ts` como features del `PLAN_ACCESS`. Cada uno tiene un plano de acceso asociado. **No los traduzcas ni los modifiques.** Si un negocio no tiene un plano activado, el asistente informará que el módulo no está disponible y dará la descripción breve definida en cada archivo de módulo.