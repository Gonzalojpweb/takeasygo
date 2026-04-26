# Documentación de Integración POS — TakeasyGO

Este documento detalla el proceso técnico, cambios en la arquitectura y manual de configuración para la integración con sistemas POS externos.

## 1. Arquitectura de Integración

La integración sigue un modelo de **Inyección de Pedidos (Order Injection)**. TakeasyGO actúa como el originador del pedido y lo envía al POS una vez que el pago es confirmado.

### Componentes Clave:
- **`lib/pos/`**: Capa de abstracción. Define una interfaz común `POSConnector` para que el sistema pueda escalar a múltiples proveedores.
- **`lib/apiKeyAuth.ts`**: Nuevo sistema de autenticación vía Bearer Token (`tgo_live_...`) para que sistemas externos interactúen con nuestra API de forma segura sin depender de sesiones de navegador.
- **Webhook de Recepción**: `/api/webhooks/pos/[tenant]` maneja las actualizaciones de estado desde el POS hacia TakeasyGO (ej: cuando el pedido está listo para retirar).

---

## 2. Cambios en el Modelo de Datos

### Tenant (Colección: `tenants`)
Se agregaron campos para almacenar la configuración de la integración y las API Keys externas:
- `posIntegration`: Objeto con `provider`, `enabled`, `credentials` (cifradas), `productMapping` y `webhookSecret`.
- `externalApiKeys`: Array de llaves generadas para el tenant, almacenadas como hash SHA-256.

### Order (Colección: `orders`)
Se agregó el objeto `posSync`:
- `status`: `pending`, `synced`, `failed`, `not_applicable`.
- `posOrderId`: ID de referencia en el sistema externo.
- `attempts`: Contador de reintentos de inyección.
- `error`: Log del último error de sincronización.

---

## 3. Seguridad

### Cifrado de Credenciales
Todas las credenciales externas (`clientId`, `clientSecret`, `webhookSecret`) se almacenan cifradas en la base de datos utilizando **AES-256-GCM** via `lib/crypto.ts`.

### Autenticación via API Keys
- Las llaves se generan con entropía de 32 bytes.
- Prefijo `tgo_live_` para fácil identificación.
- **Importante:** La llave solo se muestra UNA VEZ al usuario en la UI. En la DB solo guardamos el hash.

---

## 4. Flujo de Sincronización

1. **Pago Aprobado**: El webhook de MercadoPago recibe la confirmación.
2. **Disparo Asíncrono**: Se llama a `injectOrderToPOS()` de forma asíncrona (`setImmediate`).
3. **Traducción de Items**: El servicio utiliza el `productMapping` del tenant para convertir los IDs de TakeasyGO a los IDs del POS.
4. **Inyección con Retry**: Si el POS falla, el sistema reintenta automáticamente (3 intentos con backoff exponencial).
5. **Actualización de Estado**: El POS notifica cambios vía webhook a TakeasyGO, sincronizando el tracking del cliente.

---

## 5. Guía para el Administrador (Próximamente en UI)

Para completar la integración, el administrador deberá:
1. **Configurar Proveedor**: Elegir FUDO o BISTROSOFT.
2. **Ingresar Credenciales**: Obtener el Client ID y Secret desde su panel de POS.
3. **Mapear Productos**: Vincular cada ítem de TakeasyGO con su equivalente en el POS para que los reportes de stock y ventas sean correctos.

---

## 6. Sistema de API Keys Externas

Para permitir que el sistema POS o una PWA de cocina interactúe con TakeasyGO sin depender de sesiones de navegador, se ha implementado un sistema de **Bearer Tokens**.

### Formato del Token:
- **Prefijo**: `tgo_live_`
- **Contenido**: 32 bytes de entropía codificados en base64url.
- **Header**: `Authorization: Bearer tgo_live_...`

### Seguridad del Token:
1. **Un solo uso visual**: Al generar el token, el servidor lo devuelve en el JSON de respuesta **solo esa vez**.
2. **Hash en DB**: Internamente, solo guardamos el hash **SHA-256**. Perder la DB no compromete las llaves reales.
3. **Revocación**: El administrador puede revocar llaves instantáneamente desde el panel, invalidando el acceso del cliente externo.

---

## 7. Guía de Operación para el Administrador

### Paso 1: Configuración de FUDO
En el panel de FUDO (Administración → Aplicaciones Externas), crea una nueva App. Obtén el `Client ID` y `Client Secret`. Configura el Webhook apuntando a `https://takeasygo.com/api/webhooks/pos/[tu-slug]` y genera un `Secreto` para firmar los mensajes.

### Paso 2: Configuración en TakeasyGO
Ve a **Configuración → Integración POS** en tu panel de administración de TakeasyGO.
1. Selecciona **FUDO**.
2. Activa la integración.
3. Ingresa las credenciales obtenidas (ClientID, Secret y Webhook Secret).
4. Presiona **"Probar Conexión"**. Si ves el check verde, los sistemas ya se hablan.

### Paso 3: Mapeo de Productos
Esta es la parte más importante. Presiona **"Sincronizar Catálogo POS"**.
Aparecerá tu lista de productos de TakeasyGO. Para cada uno, selecciona el producto equivalente de tu menú en FUDO desde el menú desplegable.
- *Nota: Si dejas un producto sin vincular, TakeasyGO intentará inyectarlo por nombre, pero es propenso a errores si cambias los nombres en el POS.*

### Paso 4: Monitoreo
Cada pedido ahora mostrará un estado de sincronización. Si un pedido falla (ej: por falta de conexión del POS), verás una advertencia en tu panel de historial de pedidos.

---
*Documentación finalizada. Versión 1.0.0*
