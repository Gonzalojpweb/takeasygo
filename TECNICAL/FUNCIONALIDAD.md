# TAKEASYGO — INVENTARIO COMPLETO DE FUNCIONALIDADES

## DESCRIPCIÓN GENERAL

**TakeasyGO** es un SaaS multi-tenant para restaurantes que venden takeaway (retiro en local). Incluye menú digital, gestión de pedidos, pagos online, impresión térmica y analytics.

---

## 1. AUTENTICACIÓN Y SEGURIDAD

- Login con email/contraseña (bcrypt, rate limit 5 intentos/60s)
- Sesión JWT (8 horas de duración)
- Recuperación de contraseña vía email (token SHA-256, expira en 15 min, de un solo uso)
- Multi-tenant aislamiento (cada restaurante ve solo sus datos)
- 5 roles de usuario con permisos diferenciados
- Rate limiting en login, órdenes y pagos (Upstash Redis)
- Auditoría de acciones (quién hizo qué, cuándo y desde qué IP)
- Cifrado AES-256 de credenciales sensibles (MercadoPago)
- Headers de seguridad HTTP (HSTS, X-Frame-Options, X-Content-Type-Options)
- Validación de input con Zod en todas las APIs
- Verificación de firma HMAC en webhooks de MercadoPago

---

## 2. GESTIÓN DE MENÚ

- Crear/editar/eliminar **categorías** con nombre, descripción, imagen y orden
- Crear/editar/eliminar **items** con:
    - Nombre, descripción, precio, imagen
    - Tags (vegan, sin gluten, etc.)
    - Marcar como "destacado"
    - Activar/desactivar disponibilidad
- **Customizaciones** por item:
    - Grupos de opciones (ej: Tamaño, Extras, Salsas)
    - Tipo: selección única o múltiple
    - Campo requerido u opcional
    - Precio adicional por opción
- Orden personalizado de categorías e items (drag-and-drop)
- **Importación de menú** desde CSV o JSON (carga masiva)
- Menú separado por ubicación/local

---

## 3. PEDIDOS (ÓRDENES) — FLUJO COMPLETO

### Del lado del CLIENTE (público):

- Ver menú por local (takeaway o dine-in)
- Buscar items dentro del menú
- Agregar al carrito con customizaciones
- Checkout con datos del cliente (nombre, teléfono, email opcional)
- Notas especiales del pedido
- Pagar con MercadoPago
- Pantalla de pedido pendiente
- Pantalla de pedido exitoso (con QR para retiro)
- Pantalla de error/fallo en pago
- Rastreo en tiempo real del estado del pedido

### Del lado del RESTAURANTE (admin):

- Vista en tiempo real de órdenes activas y pendientes
- Cambiar estado: `pending → confirmed → preparing → ready → delivered / cancelled`
- Registro automático de timestamp en cada cambio de estado
- Búsqueda y filtros (por fecha, estado, cliente, número de orden)
- Historial completo de órdenes
- Notas del cliente visibles en la orden
- Impresión automática al cambiar de estado

---

## 4. PAGOS (MERCADOPAGO)

- Integración con MercadoPago (preferencias de pago)
- Credenciales por restaurante (acceso token, public key, webhook secret)
- Credenciales cifradas en base de datos
- Webhook de confirmación de pago (verificación HMAC)
- Estados de pago: `pending → approved / rejected / cancelled`
- Metadata completa de MercadoPago almacenada en cada orden
- Nunca se almacenan datos de tarjeta

---

## 5. IMPRESORAS TÉRMICAS

- Registro de impresoras por nombre, IP, puerto y rol
- Múltiples impresoras por local
- Roles de impresora:
    - **kitchen**: imprime en cocina
    - **bar**: imprime en barra
    - **cashier**: imprime recibos de pago
- Soporte para papel de 58mm y 80mm
- Protocolo ESC/POS (TCP/IP al puerto 9100)
- Estado de conexión: ok, error, offline, desconocido
- Registro del último error
- Registro del último print exitoso
- Log histórico de todos los intentos de impresión por orden

---

## 6. CONFIGURACIÓN DEL RESTAURANTE

### Perfil:

- Nombre del restaurante
- Descripción del menú
- Descripción "Acerca de nosotros"
- Redes sociales (Instagram, Facebook, Twitter)

### Branding personalizado (marca visual):

- Color primario, secundario, fondo y texto
- Logo del restaurante
- Tipografía (font family)
- Estilo de bordes (sharp, rounded, pill)
- Layout del menú (grilla o lista)
- Modo oscuro (dark mode)

### Ubicaciones/Sucursales:

- Múltiples sedes por restaurante
- Nombre, dirección, teléfono, horario
- Modo de orden por sede (takeaway, dine-in, ambos)
- Tiempo estimado de retiro por sede
- Imagen o video hero de portada por sede
- Activar/desactivar aceptación de pedidos por sede

---

## 7. REPORTES Y ANALYTICS

- Revenue total y mensual (excluyendo cancelaciones)
- Total de órdenes en el período
- Ticket promedio (revenue / órdenes)
- Crecimiento MoM (mes vs mes anterior, en %)
- Top 5 ítems más vendidos (por cantidad)
- Top 5 ítems con más revenue
- Revenue por categoría
- Gráficos de tendencias temporales
- Filtros por fecha y por ubicación
- **Exportación a Excel** del reporte completo

---

## 8. ICO — ÍNDICE DE CONSISTENCIA OPERATIVA

Score propio de TakeasyGO (0-100) que mide la calidad operativa del restaurante. Se calcula con:

| Componente | Peso | Qué mide |
| --- | --- | --- |
| Consistencia de tiempos de preparación (TPP) | 25% | Estabilidad (coeficiente de variación) |
| Cumplimiento de tiempos estimados | 30% | % órdenes entregadas antes del tiempo prometido |
| Baja tasa de cancelación | 20% | Penaliza cancelaciones |
| Actividad sostenida | 15% | Volumen de los últimos 7 días vs promedio del mes |
| Estabilidad horaria | 10% | Días activos en los últimos 30 días |

**Bandas diagnósticas**:

- 91-100: Alta consistencia ✅
- 76-90: Operación estable 🟢
- 51-75: En consolidación 🟡
- 0-50: Ajustes necesarios 🔴

**Validez estadística**:

- < 10 órdenes: Datos insuficientes
- 10-29: Muestra pequeña (con advertencia)
- ≥ 30: Datos válidos (IC 95%)

---

## 9. GESTIÓN DE USUARIOS Y ROLES

| Rol | Accesos |
| --- | --- |
| **superadmin** | Todo: tenants, users globales, leads, analytics de plataforma |
| **admin** | Todo del restaurante: menú, órdenes, settings, usuarios, reportes, auditoría |
| **manager** | Órdenes activas, historial, reportes, cambio de estado |
| **staff** | Confirmar órdenes, marcar como "preparando" y "listo" |
| **cashier** | Ver órdenes, marcar como "entregado" |
- Crear usuarios por restaurante
- Asignar roles y ubicación específica
- Desactivar usuarios (soft delete)
- Reset de contraseña por admin
- Reset de contraseña por el propio usuario (forgot-password)

---

## 10. AUDITORÍA

- Log de todas las acciones críticas (quién, qué, cuándo, IP)
- Registra: cambios de estado de órdenes, edición de menú, cambios de settings, acciones de usuarios
- Filtros en el visor de auditoría
- Exportación del log de auditoría

---

## 11. SUPERADMIN (PANEL DE PLATAFORMA)

- KPIs globales: tenants activos, total órdenes, revenue mensual de plataforma, crecimiento MoM
- Top 5 restaurantes más activos (por órdenes y revenue)
- Listado de todos los restaurantes (crear, editar, activar/desactivar)
- Crear nuevo restaurante con slug único
- Gestionar usuarios de cada restaurante
- Gestionar ubicaciones de cada restaurante
- **CRM de leads**: captura, seguimiento y cambio de estado (new, contacted, closed, lost)

---

## 12. LANDING PAGE Y CAPTACIÓN

- Hero section con propuesta de valor
- Sección de características del producto
- "Cómo funciona" paso a paso
- Sección de planes y precios
- FAQ (preguntas frecuentes)
- Sección de demo
- **Captura de leads**: nombre, email, teléfono, plan elegido
- Modal de interés al seleccionar plan

---

## 13. EXPERIENCIA PÚBLICA DEL CLIENTE

- Menú digital del restaurante (con branding del local)
- Modo takeaway vs dine-in seleccionable
- Búsqueda de platos
- Carrito de compras persistente (local storage)
- Checkout sencillo (nombre + teléfono + email opcional)
- Flujo de pago con MercadoPago
- Número de orden único (ej: REST-20260305-001)
- Pantalla de tracking en tiempo real con estado actual
- QR en pantalla de éxito para mostrar en caja

---

## 14. MODELOS DE DATOS (lo que guarda el sistema)

| Modelo | Datos clave |
| --- | --- |
| **Usuario** | nombre, email, contraseña (hash), rol, tenantId, locationId |
| **Restaurante** | slug, plan, branding, perfil, credenciales MP cifradas |
| **Ubicación** | nombre, dirección, teléfono, horarios, modos de orden |
| **Menú** | categorías → items → customizaciones (por tenant+location) |
| **Orden** | items, customizaciones, total, cliente, estado, timestamps, pago, printLog |
| **Impresora** | IP, puerto, roles, estado, historial de prints |
| **Auditoría** | acción, entidad, usuario, IP, cambios detallados |
| **Lead** | nombre, negocio, email, teléfono, plan, estado CRM |
| **Rating** | orderId (único), tenantId, locationId, estrellas (1-5), comentario, createdAt |

---

## 15. INTEGRACIONES EXTERNAS

Servicio	Uso
MercadoPago	Pagos online de órdenes
Upstash Redis	Rate limiting (anti-fuerza bruta)
Nodemailer / SMTP	Emails de recuperación de contraseña
MongoDB Atlas	Base de datos principal
Vercel	Hosting de app y APIs
Impresoras ESC/POS	Impresión térmica de tickets