# 03-glosario.md — Términos de la plataforma

Los siguientes términos son el glosario estándar usado en toda la plataforma TakEasyGo. Se deben usar para consistencia en la comunicación del asistente.

## Roles y tipos de dispositivo

| Término | Definición |
|---------|------------|
| **admin** | Rol con permisos completos para gestionar el negocio: todos los módulos, configuración, usuarios, reportes, fiscal. |
| **manager** | Rol de gerente de operación: puede gestionar operaciones (órdenes, mesas, inventario, clientes) pero no configuración ni usuarios. |
| **cashier** | Rol de cajero: puede procesar ventas, abrir/cerrar caja, recibir pagos. No puede gestionar usuarios ni configuración. |
| **waiter** | Rol de mozo/camarero: puede asignar mesas, ver órdenes, pero no pagar ni modificar configuración. |
| **kitchen** | Personal de cocina: puede ver órdenes para preparar alimentos, pero no interactuar con el POS directamente. |
| **hub** | Tipo de dispositivo: terminal de caja principal (cajero). |
| **handheld** | Tipo de dispositivo: celular del mozo (online, via socket). |
| **spoke** | Tipo de dispositivo: cliente pareado al hub en LAN. |

## Planes y flags

| Término | Definición |
|---------|------------|
| **trial** | Plan gratuito con límites: 1 sede, 1 impresora, 30 pedidos para ICO. |
| **try** | Plan inicial: $35.000 ARS/mes. Límites ampliados: 150 miembros del club, 1 sede. |
| **buy** (Crecimiento) | Plan $45.000 ARS/mes. Habilita: reportes, usuarios, multi-sede, multi-impresoras, inventory, SOS, loyaltyExport, posIntegration, hiddenRewards (hasta 20/sede). |
| **full** (Premium) | Plan $60.000 ARS/mes. Todo lo de buy más: analyticsAdv, icoAdvanced, store, loyaltyAnalytics, hiddenRewards ilimitados, cashPayment. |
| **anfitrion** | Plan de lanzamiento: acceso exclusivo. Solo menú y settings. Sin pedidos activos ni club. |
| **features** | Identificadores de módulos en `PLAN_ACCESS` (ej. `menu`, `orders`, `inventory`, etc.). |

## Dispositivos y emparejamiento

| Término | Definición |
|---------|------------|
| **POS** | Punto de venta. Puede ser un hub (terminal de caja) o un conjunto de spokes/handhelds. |
| **pairing** | Proceso de emparejamiento entre hub y spoke(s) vía LAN. Requiere rol admin o manager. |
| **blacklist** | Lista de dispositivos bloqueados. Solo admin puede dar de baja un dispositivo. |
| **jwt** | JSON Web Token usado para autenticación en todas las APIs. Firma RS256, TTL 30 min, max sesión 16 hs. |

## Órdenes y ventas

| Término | Definición |
|---------|------------|
| **orderMode** | Modo de la orden: `dine-in` (comensal), `takeaway` (para llevar), `delivery` (envío a domicilio), `business` (venta corporativa). |
| **paymentMethod** | Método de pago: `cash`, `mercadopago`, `posnet_debit`, `posnet_credit`, `kripton`, `transfer`. |
| **CashChannel** | Canal de la venta: `counter` (presencial en mostrador/salón) o `takeasygo` (delivery, takeaway, venta por app). |
| **surcharge** | Recargo por método de pago (ej. tarjeta de crédito, débito). Configurable por plan. |
| **Z Report** | Reporte de cierre Z: snapshot inmutable de la caja al final del turno. Generado UNA sola vez. |
| **fiscal** | Configuración de facturación AFIP (WSFE o impresora fiscal). Requiere plan `full` para configuración avanzada. |

## Club de Fidelización

| Término | Definición |
|---------|------------|
| **loyaltyClub** | Club de fidelización de miembros. Límites por plan: trial=30, try=150, buy/full=ilimitado. |
| **loyaltyExport** | Exportación de lista de miembros (solo buy/full). |
| **loyaltyAnalytics** | Analytics avanzados del club (métricas de recompra, frecuencia, segmentación). Plan full solo. |
| **hiddenRewards** | Recompensas escondidas en el menú. Growth: hasta 20 por sede. Premium: ilimitado. |
| **sos** | Sistema SOS / Reward Advance: préstamo de puntos en checkout. Plan buy/full. |

## Configuración y fiscal

| Término | Definición |
|---------|------------|
| **fiscalDriver** | Driver fiscal: `printer` (impresora térmica) o `wsfe` (AFIP/WFEs). |
| **comprobante** | Documento electrónico: tipo `A`, `B`, `C` o `ticket`. |
| **CAE** | Código de Autorización Electrónica AFIP. Vence y se reintenta automáticamente. |
| **puntoVenta** | Número de punto de venta AFIP. |
| **cash_register** | Caja registradora. Se abre y cierra por turno. |
| **shareToken** | Token para compartir el Z Report por link (UUID v4, válido 30 días). |

## Inventario e insumos

| Término | Definición |
|---------|------------|
| **inventory** | Módulo TGO Inventory: control de insumos, recetas y consumo por venta. Plan buy/full. |
| **recipe** | Receta de un plato: relación de productos y cantidades necesarias. |
| **stockPortions** | Porciones que alcanzan con el stock actual para un producto. |
| **unavailableReason** | Por qué un producto no está disponible: `manual` (pausado por rol) o `stock` (insuficiente inventario). |

## Métricas y KPIs

| Término | Definición |
|---------|------------|
| **ICO** | Índice de Fiabilidad Operativa: score de 0-100 que mide la salud operativa del restaurante. |
| **TPP** | Tiempo Promedio de Preparación: promedio de tiempo que tarda un plato en estar listo. |
| **Tasa de Cancelación** | Porcentaje de órdenes canceladas sobre el total. |
| **Tasa de recompra** | Porcentaje de clientes que realizan una segunda compra en 90 días. |
| **Hora Pico** | Período del día con mayor volumen de pedidos. |
| **Distribución horaria** | Gráfica de pedidos por hora del día. |

## Errores y códigos

| Término / Código | Significado |
|------------------|-------------|
| `validation_error` | Error de validación de datos (esquema Zod). El cuerpo de la petición no cumple con el formato esperado. |
| `account_locked` | Cuenta temporalmente bloqueada por múltiples fallos de login. |
| `session_max_age` | Sesión expirada por exceder el tiempo máximo (16 horas desde el login). |
| `invalid_session` | Sesión inválida (usuario dado de baja o sesión corrupta). |
| `ROLE_NOT_ALLOWED` | Intento de acción no permitida para el rol del usuario. |
| `Tenant mismatch` | Intento de operación sobre un tenant que no corresponde al usuario autenticado. |
| `location_inactive` | Sede asociada al token ya no está activa. |