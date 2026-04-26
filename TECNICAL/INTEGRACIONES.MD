# INTEGRACIONES POS — INFORME TÉCNICO Y ESTRATÉGICO
## TakeasyGO × Sistemas POS (FUDO / BISTROSOFT y otros)

> **Propósito del documento:** Responder con precisión si es técnicamente posible conectar TakeasyGO con sistemas POS como FUDO o BISTROSOFT, cómo se hace, quién hace qué, qué riesgos existen y cuál es el camino correcto a seguir.
>
> **Última actualización:** Abril 2026
> **Estado:** Investigación completada. Aún no implementado. Decisión estratégica pendiente.

---

## 1. CONTEXTO: POR QUÉ SURGE ESTA PREGUNTA

TakeasyGO es un SaaS multi-tenant para restaurantes takeaway. Recibe pedidos del cliente final, los gestiona y los paga a través de MercadoPago. El restaurante los administra desde el panel de TakeasyGO.

El problema que plantea esta integración es el siguiente:

> **Muchos restaurantes ya usan un sistema POS** (punto de venta) como FUDO o BISTROSOFT para gestionar su operación interna (caja, comandas, cocina, facturación). Si TakeasyGO y ese POS funcionan en paralelo sin hablar entre sí, el restaurante tiene **dos sistemas desconectados**. Eso genera:

- Doble ingreso manual de pedidos
- Riesgo de errores y desincronización
- Fricción para el staff (dos pantallas, dos flujos)
- Posible rechazo del restaurante a adoptar TakeasyGO

La pregunta es: **¿Se puede conectar TakeasyGO con su POS para que un pedido generado en TakeasyGO impacte directamente en el sistema interno del restaurante?**

**Respuesta corta:** Sí, es técnicamente posible — pero el cómo, quién y con qué nivel de esfuerzo depende fuertemente de cada POS.

---

## 2. CÓMO FUNCIONA UN POS EN UN RESTAURANTE (BASE)

Para entender la integración hay que entender qué hace un POS y qué datos maneja.

Un sistema POS (Point of Sale) para restaurantes gestiona:

| Área | Qué hace |
|---|---|
| **Caja** | Registra ventas, medios de pago, cierres |
| **Comandas** | Envía pedidos a cocina / barra |
| **Menú** | Catálogo de productos con precios |
| **Stock** | Control de ingredientes e insumos |
| **Reportes** | Ventas del día, semana, mes |
| **Facturación** | Emisión de comprobantes fiscales (AFIP, SAT) |

Cuando un restaurante usa FUDO o BISTROSOFT, **todo pasa por ahí**. Las comandas van a la cocina desde el POS. La caja cierra desde el POS. Si un pedido externo no entra al POS, el restaurante tiene que ingresarlo manualmente o ignorarlo desde el sistema.

---

## 3. QUÉ SIGNIFICA "INTEGRAR" TAKEASYGO CON UN POS

La integración que buscamos es específica:

```
CLIENTE pide en TakeasyGO
      ↓
TakeasyGO procesa el pago (MercadoPago)
      ↓
TakeasyGO inyecta el pedido en el POS (FUDO / BISTROSOFT)
      ↓
El POS lo recibe como si fuera un pedido interno
      ↓
Cocina recibe comanda, staff gestiona, caja lo registra
```

Esto se llama técnicamente **"Order Injection"** (inyección de pedidos) o **"Order Push"**.

El resultado esperado: el restaurante no necesita copiar el pedido de una pantalla a otra. Llega solo.

---

## 4. FUDO POS — ANÁLISIS COMPLETO

### 4.1 ¿Qué es FUDO?

FUDO es un sistema POS SaaS para restaurantes, muy usado en Argentina, México y Latinoamérica. Tiene versión web y app. Gestiona mesas, delivery, takeaway, caja y cocina. Tiene planes con distintas capacidades.

**Sitio web:** https://fu.do  
**Soporte:** soporte@fu.do  
**Centro de ayuda:** https://ayuda.fu.do

---

### 4.2 ¿FUDO tiene API?

**Sí. FUDO tiene dos APIs:**

#### API 1 — Inyección de Pedidos (Order Injection API)
- **Estado:** Beta
- **Propósito específico:** Permite que aplicaciones externas (como TakeasyGO) creen órdenes dentro de FUDO
- **Capacidades:**
  - Crear pedidos con sus ítems y customizaciones
  - Consultar el catálogo de productos y categorías del restaurante
  - Recibir notificaciones de cambio de estado del pedido (webhooks)
  - Trigger automático de impresión de comanda en cocina

#### API 2 — API General
- **Estado:** Estable
- **Propósito:** Consulta y modificación de recursos generales del sistema (más compleja y flexible)
- **Requiere:** Habilitación especial por soporte

---

### 4.3 ¿Cómo funciona la autenticación en FUDO?

**Flujo de autenticación:**

1. El restaurante (admin de FUDO) accede a su panel
2. Va a: `Administración → Aplicaciones Externas (Beta)`
3. Crea una "Nueva Aplicación Externa"
4. FUDO genera automáticamente:
   - `client_id` → identificador de la aplicación
   - `client_secret` → clave secreta de autenticación
5. Esas credenciales se entregan al integrador externo (TakeasyGO)

**No es OAuth2 estándar de usuario final.** Es un sistema de credenciales de aplicación que el restaurante genera desde su panel y luego comparte con el sistema externo.

---

### 4.4 ¿Quién genera las credenciales?

**El restaurante.**

FUDO no le da acceso a TakeasyGO directamente. El restaurante, siendo dueño de su cuenta FUDO, genera las credenciales para que TakeasyGO pueda hablar con su instancia de FUDO.

Es exactamente igual al modelo de MercadoPago que ya usa TakeasyGO:
- El restaurante tiene su cuenta MercadoPago
- El restaurante genera sus tokens (Access Token, Public Key, Webhook Secret)
- El restaurante se los pasa a TakeasyGO
- TakeasyGO los almacena cifrados (AES-256) y los usa para procesar pagos

Con FUDO sería idéntico:
- El restaurante tiene su cuenta FUDO
- El restaurante genera `client_id` y `client_secret` desde su panel
- El restaurante se los pasa a TakeasyGO en la configuración del tenant
- TakeasyGO los almacena cifrados y los usa para inyectar pedidos

---

### 4.5 Webhooks de estado en FUDO

FUDO puede notificar a TakeasyGO sobre cambios de estado del pedido:

| Evento | Significado |
|---|---|
| `ORDER-CONFIRMED` | El restaurante confirmó el pedido |
| `ORDER-REJECTED` | El restaurante rechazó el pedido |
| `ORDER-READY-TO-DELIVER` | El pedido está listo para retirar |
| `ORDER-DELIVERY-SENT` | El pedido fue enviado (delivery) |
| `ORDER-CLOSED` | El pedido fue cerrado/completado |

Esto significa que TakeasyGO podría actualizar automáticamente el estado de la orden en su propio sistema cuando FUDO cambia el estado internamente. El restaurante gestiona desde FUDO y TakeasyGO se mantiene sincronizado.

> **Impacto en TakeasyGO:** El tracking en tiempo real que el cliente ve (`pending → confirmed → preparing → ready`) podría alimentarse también desde los eventos del POS, no solo desde el panel de TakeasyGO.

---

### 4.6 Requisitos para habilitar la API de FUDO

1. **El restaurante debe tener un plan activo en FUDO** que incluya acceso a la API (generalmente Plan Pro o planes por mesas)
2. **El restaurante debe solicitar la activación** enviando un email a `soporte@fu.do` desde la cuenta de administrador
3. Una vez habilitado, el restaurante accede a la sección "Aplicaciones Externas" y genera las credenciales
4. El restaurante comparte `client_id` y `client_secret` con TakeasyGO

---

### 4.7 Flujo técnico completo FUDO

```
[CONFIGURACIÓN — una sola vez por restaurante]

1. Restaurante activa API en su cuenta FUDO (solicita por email a FUDO)
2. Restaurante genera client_id + client_secret en su panel FUDO
3. Restaurante ingresa esas credenciales en el panel de TakeasyGO (Settings → Integraciones)
4. TakeasyGO almacena credenciales cifradas (como hace hoy con MercadoPago)
5. TakeasyGO registra su URL de webhook en FUDO para recibir eventos

[OPERACIÓN — cada pedido]

1. Cliente hace pedido en TakeasyGO → pago aprobado por MercadoPago
2. TakeasyGO crea la orden en su propia base de datos (MongoDB)
3. TakeasyGO llama a la API de FUDO con el pedido completo (ítems, cantidades, cliente)
4. FUDO recibe el pedido → lo muestra en el panel del restaurante
5. FUDO imprime automáticamente la comanda en cocina
6. Cuando el staff cambia el estado en FUDO → FUDO envía webhook a TakeasyGO
7. TakeasyGO actualiza el estado de la orden en su sistema
8. El cliente ve el estado actualizado en tiempo real en TakeasyGO
```

---

### 4.8 Mapeo de datos: TakeasyGO → FUDO

Este es el aspecto más técnico. El payload que TakeasyGO envía a FUDO debe mapear los productos de TakeasyGO con los productos registrados en FUDO.

**Problema clave:** Los productos en TakeasyGO tienen sus propios IDs (MongoDB ObjectId). Los productos en FUDO tienen sus propios IDs internos. Para que la inyección funcione, uno de los dos sistemas tiene que conocer el ID del otro.

**Solución posible:**

1. TakeasyGO llama a la API de FUDO para obtener el catálogo del restaurante (endpoint de productos/categorías)
2. En el panel de TakeasyGO (Settings → Integraciones → FUDO), el admin vincula cada producto de TakeasyGO con su equivalente en FUDO
3. Esa tabla de mapeo se almacena en MongoDB como parte de la configuración del tenant
4. Al inyectar el pedido, TakeasyGO traduce sus IDs a los IDs de FUDO

**Alternativa (si FUDO lo permite):** Inyectar con nombres de producto en lugar de IDs, dejando que FUDO intente hacer el match por nombre. Menos confiable pero más simple de configurar.

---

## 5. BISTROSOFT — ANÁLISIS COMPLETO

### 5.1 ¿Qué es BISTROSOFT?

BISTROSOFT es un sistema POS para restaurantes con presencia en Argentina, México y España. Tiene módulos de punto de venta, menú digital, gestión de sala, cocina, facturación, y delivery. Muy usado por cadenas y restaurantes medianos/grandes en Argentina.

**Sitio web:** https://bistrosoft.com  
**Argentina:** https://bistrosoft.com (sitio específico)  
**Soporte AR:** +54 11 3775-7552 (WhatsApp)  
**Ventas:** ventas@bistrosoft.com

---

### 5.2 ¿BISTROSOFT tiene API?

**Sí, pero con una lógica diferente a FUDO.**

BISTROSOFT tiene un servicio llamado **"Bistro API"**, pero su propósito principal según la documentación pública es:
- Acceder a **datos históricos** del negocio
- Crear **métricas y tableros de BI** (Business Intelligence)
- Conectar con herramientas de Machine Learning y predicción de ventas
- Exportar datos a sistemas externos

**Lo que NO está claro de forma pública:**
- Si la API permite **inyectar pedidos** (order injection) desde afuera
- Si existe un endpoint específico para recibir pedidos externos en tiempo real

**Lo que SÍ tienen según su documentación pública:**
- Integraciones nativas con: **Uber Eats, DiDi Food, Rappi**
- Un "Tablero de integraciones" donde se gestionan todas las plataformas de delivery conectadas
- Soporte para integraciones mediante agregadores como **Deliverect** (middleware)
- Posibilidad de conectar plataformas no nativas a través de su equipo técnico evaluando cada caso

---

### 5.3 Modelo de integración de BISTROSOFT

BISTROSOFT funciona diferente a FUDO en términos de apertura de API:

**Modelo FUDO:** API semi-abierta → el restaurante genera credenciales desde su panel → cualquier desarrollador puede integrarse con esas credenciales.

**Modelo BISTROSOFT:** API cerrada → el acceso no es público → se gestiona directamente con el equipo comercial/técnico de BISTROSOFT → requieren evaluación del caso antes de dar acceso.

Esto significa que para integrar TakeasyGO con BISTROSOFT:

1. **No existe documentación pública** de la API para desarrolladores externos
2. **Se debe contactar directamente a BISTROSOFT** y plantear el caso: "somos una plataforma de takeaway que quiere enviar pedidos a vuestro sistema"
3. BISTROSOFT evaluará si la integración es viable y bajo qué condiciones
4. Puede derivar hacia un acuerdo de **partnership técnico** entre TakeasyGO y BISTROSOFT

**Alternativa via Deliverect:**
BISTROSOFT ya tiene integración con Deliverect (un middleware de integración de delivery). Si TakeasyGO se integrara con Deliverect, podría llegar indirectamente a BISTROSOFT. Sin embargo, Deliverect tiene sus propios costos y agrega una capa adicional de complejidad.

---

### 5.4 ¿Qué se puede hacer hoy con BISTROSOFT?

| Funcionalidad | Estado |
|---|---|
| Consultar datos históricos (ventas, reportes) | Posible vía Bistro API, gestionado con su equipo |
| Inyectar pedidos externos en tiempo real | No confirmado públicamente, requiere contacto directo |
| Sincronizar menú | No confirmado públicamente |
| Recibir webhooks de estado | No confirmado públicamente |
| Integraciones nativas delivery | Solo Uber Eats, Rappi, DiDi Food |

---

### 5.5 Flujo de contacto con BISTROSOFT (si se decide avanzar)

```
PASO 1: Contactar al equipo técnico de BISTROSOFT
  → Email: ventas@bistrosoft.com
  → WhatsApp AR: +54 11 3775-7552
  → Mensaje: "Somos TakeasyGO, plataforma SaaS de takeaway.
    Queremos integrar nuestro sistema con BISTROSOFT para que
    los pedidos generados en nuestra plataforma aparezcan
    automáticamente en el sistema del restaurante.
    ¿Cuentan con una API de inyección de pedidos para desarrolladores?"

PASO 2: Evaluar la respuesta
  → Si tienen API de order injection → solicitar documentación técnica y condiciones
  → Si no tienen → evaluar si proponen partnership o middleware (Deliverect)
  → Si el acceso requiere licencia PRO del restaurante → documentarlo como requisito

PASO 3: Prototipo técnico
  → Con la documentación, construir una prueba de concepto
  → Testear con un restaurante que ya use BISTROSOFT y quiera probar TakeasyGO
```

---

## 6. ¿QUIÉN HACE QUÉ? MODELO DE RESPONSABILIDADES

Esta es la pregunta más importante del documento porque define el trabajo de TakeasyGO versus el del restaurante versus el del POS.

### Tabla de responsabilidades

| Tarea | ¿Quién la hace? | Notas |
|---|---|---|
| Tener cuenta activa en el POS | **El restaurante** | Es su sistema actual. TakeasyGO no interfiere |
| Habilitar la API en el POS | **El restaurante** (en FUDO: solicitar a soporte@fu.do) | El restaurante activa la funcionalidad en su propia cuenta |
| Generar credenciales de integración | **El restaurante** (desde su panel POS) | El POS genera `client_id` y `client_secret` |
| Ingresar credenciales en TakeasyGO | **El restaurante** (admin del tenant) | Igual que hace hoy con MercadoPago |
| Almacenar y proteger las credenciales | **TakeasyGO** | Cifrado AES-256, igual que ya hace con MercadoPago |
| Construir el conector (código de integración) | **TakeasyGO** | Es el trabajo técnico del lado de TakeasyGO |
| Mapear productos TakeasyGO ↔ POS | **El restaurante** + **TakeasyGO** (UI de mapeo) | El restaurante vincula manualmente sus ítems |
| Enviar el pedido al POS | **TakeasyGO** (automático) | TakeasyGO llama la API del POS cuando se aprueba el pago |
| Manejar errores de inyección | **TakeasyGO** | Si la inyección falla, TakeasyGO debe tener fallback |
| Gestionar el pedido en el POS | **El restaurante** (desde su POS) | El staff trabaja normalmente en FUDO/BISTROSOFT |
| Notificar cambios de estado al cliente | **TakeasyGO** (vía webhooks del POS) | TakeasyGO recibe el evento y actualiza su propia orden |

### Analogía con MercadoPago (modelo que ya funciona)

```
MercadoPago hoy:
  → Restaurante tiene cuenta MP
  → Restaurante genera credenciales en MP
  → Restaurante ingresa credenciales en TakeasyGO
  → TakeasyGO usa esas credenciales para procesar pagos
  → MP notifica a TakeasyGO vía webhook

Integración POS (modelo idéntico):
  → Restaurante tiene cuenta FUDO/BISTROSOFT
  → Restaurante genera credenciales en el POS
  → Restaurante ingresa credenciales en TakeasyGO
  → TakeasyGO usa esas credenciales para inyectar pedidos
  → POS notifica a TakeasyGO vía webhook (cambios de estado)
```

**El patrón es exactamente el mismo.** TakeasyGO ya sabe hacer esto.

---

## 7. ¿TakeasyGO DEBE CONSTRUIR SU PROPIA API O "DARLE API AL POS"?

**No. TakeasyGO no "le da una API" al POS.**

Es al revés: el POS expone su API y TakeasyGO la consume. TakeasyGO es el cliente de esa API, no el proveedor.

Lo que SÍ debe construir TakeasyGO es:

1. **Un conector por cada POS** (módulo interno de código)
   - Autenticación contra la API del POS
   - Endpoint de inyección de pedido (POST)
   - Endpoint de consulta de catálogo (GET)
   - Handler de webhooks entrantes del POS

2. **Una UI de configuración en el panel admin** (Settings → Integraciones)
   - Campos para ingresar las credenciales del POS
   - Botón para testear la conexión
   - Selector para mapear productos

3. **Lógica de fallback**
   - ¿Qué pasa si el POS está caído cuando llega un pedido?
   - ¿Se reintenta automáticamente?
   - ¿Se guarda en cola y se reintenta después?
   - ¿Se notifica al restaurante?

4. **Un endpoint propio de TakeasyGO para recibir webhooks del POS**
   - URL pública: `https://takeasygo.com/api/webhooks/pos/[tenant-slug]`
   - Verificación de firma/autenticidad del mensaje
   - Actualización del estado de la orden en MongoDB

---

## 8. FLUJO TÉCNICO UNIFICADO (Diagrama de secuencia)

```
CONFIGURACIÓN INICIAL (una vez por restaurante)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Restaurante ──solicita API──► FUDO/BISTROSOFT
FUDO/BISTROSOFT ──da credenciales──► Restaurante
Restaurante ──ingresa credenciales──► TakeasyGO Panel
TakeasyGO ──cifra y guarda──► MongoDB
TakeasyGO ──registra webhook URL──► FUDO/BISTROSOFT


PEDIDO EN TIEMPO REAL (cada orden)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cliente ──abre menú──► TakeasyGO
Cliente ──agrega ítems──► carrito
Cliente ──checkout──► TakeasyGO
TakeasyGO ──crea preferencia──► MercadoPago
Cliente ──paga──► MercadoPago
MercadoPago ──webhook aprobado──► TakeasyGO

[solo si pago aprobado]
TakeasyGO ──guarda orden (pending)──► MongoDB
TakeasyGO ──inyecta pedido──► FUDO/BISTROSOFT API
  success → TakeasyGO marca orden como "synced_with_pos: true"
  error   → TakeasyGO encola reintento / notifica al restaurante

FUDO/BISTROSOFT ──imprime comanda──► Cocina
Staff ──cambia estado──► FUDO/BISTROSOFT
FUDO/BISTROSOFT ──webhook ORDER-CONFIRMED──► TakeasyGO
TakeasyGO ──actualiza estado──► MongoDB (pending → confirmed)
Cliente ──ve estado actualizado──► pantalla de tracking
```

---

## 9. RIESGOS Y CONSIDERACIONES CRÍTICAS

### 9.1 Riesgo técnico: Doble fuente de estado

Si el restaurante tiene dos sistemas:
- TakeasyGO: cambia estado desde el panel propio
- FUDO/BISTROSOFT: cambia estado desde el POS

¿Cuál manda? ¿Pueden contradecirse?

**Estrategia sugerida:** Una vez habilitada la integración con POS, el estado en TakeasyGO pasa a ser de **solo lectura** (actualizable solo por los webhooks del POS). El panel de TakeasyGO muestra el estado pero no permite cambiarlo manualmente para no generar conflictos.

---

### 9.2 Riesgo técnico: Producto no mapeado

Si un restaurante agrega un producto nuevo en TakeasyGO pero no lo mapea con el POS, el pedido que contenga ese ítem no puede inyectarse correctamente.

**Estrategia sugerida:**
- Validar el pedido antes de inyectar: verificar que todos los ítems tengan mapeo POS válido
- Si algún ítem no tiene mapeo → mostrar advertencia clara al restaurante en el panel de configuración
- Alternativa: inyectar lo que se puede + agregar nota al pedido con los ítems sin mapeo

---

### 9.3 Riesgo técnico: El POS está caído

Si FUDO o BISTROSOFT tienen un outage en el momento del pedido, la inyección falla. El pago ya fue cobrado al cliente pero el POS no recibió el pedido.

**Estrategia sugerida:**
- Queue de reintentos (3 intentos con backoff exponencial: 1s, 5s, 30s)
- Si todos los reintentos fallan → alerta al restaurante por email/panel
- El pedido igual existe en TakeasyGO y puede gestionarse desde allí
- Auditoría de cada intento de inyección (fecha, resultado, error)

---

### 9.4 Riesgo de negocio: Dependencia del plan del POS

La API de FUDO requiere Plan Pro. Si un restaurante tiene un plan básico de FUDO, no puede usar la integración. TakeasyGO no puede controlar esto.

**Impacto:** La integración no es universal. Algunos restaurantes con FUDO tendrán la opción, otros no.

**Estrategia sugerida:** Documentar claramente en la UI de configuración qué plan del POS se requiere para activar la integración.

---

### 9.5 Riesgo de negocio: BISTROSOFT no tiene API pública

Con BISTROSOFT la situación es más incierta. Su API de inyección de pedidos no está documentada públicamente. Puede que:
- No exista
- Exista pero requiera un acuerdo comercial con BISTROSOFT
- Exista pero sea accesible solo bajo licencia PRO + solicitud especial

**Impacto:** La integración con BISTROSOFT puede no ser posible sin una negociación directa TakeasyGO ↔ BISTROSOFT.

---

### 9.6 Riesgo técnico: Sincronización de catálogo

Los menús cambian. Si el restaurante agrega, modifica o elimina un ítem en FUDO, TakeasyGO no sabe automáticamente. El mapa de productos puede quedar desactualizado.

**Estrategia sugerida:**
- Botón de "Re-sincronizar catálogo" en el panel de TakeasyGO
- Sincronización automática diaria del catálogo del POS
- Alertas cuando un ítem mapeado ya no existe en el POS

---

### 9.7 Riesgo fiscal / regulatorio

FUDO y BISTROSOFT gestionan la **facturación fiscal** (AFIP en Argentina). Si TakeasyGO inyecta pedidos en el POS, ¿cómo se registra fiscalmente esa venta? ¿El POS la factura? ¿TakeasyGO también la faktura?

**Esto puede generar doble registro contable si no se coordina bien.**

**Estrategia sugerida:**
- Definir claramente: TakeasyGO registra el pago (MercadoPago) pero la factura fiscal sale del POS
- O: TakeasyGO emite el comprobante y el POS solo registra la venta internamente sin facturar
- Esto debe coordinarse directamente con el equipo de FUDO/BISTROSOFT durante la integración
- Puede variar por país (Argentina: AFIP; México: SAT)

---

## 10. ¿VALE LA PENA HACER ESTA INTEGRACIÓN? ANÁLISIS ESTRATÉGICO

### Argumento a favor

1. **Elimina la fricción de adopción:** El mayor obstáculo para que un restaurante con FUDO/BISTROSOFT adopte TakeasyGO es tener "otra pantalla más". Si los pedidos caen solos en su POS, la fricción desaparece.

2. **Posicionamiento diferencial:** Muy pocas plataformas de takeaway independientes tienen integración POS. Esto te posiciona como la opción "enterprise" del mercado.

3. **Es el mismo modelo que ya funciona:** TakeasyGO ya hace esto con MercadoPago. La arquitectura es la misma (credenciales cifradas + webhooks). No es nuevo terreno.

4. **Protege la retención de clientes:** Un restaurante que tenga TakeasyGO integrado con su POS es casi irremovible. El costo de cambiar de plataforma es altísimo.

### Argumento en contra (por ahora)

1. **Esfuerzo de desarrollo significativo:** Cada POS requiere un conector específico. FUDO es distinto a BISTROSOFT. El mantenimiento de múltiples conectores es costoso operativamente.

2. **No es prioridad en Fase 1:** TakeasyGO está en etapa de adquisición y consolidación. El SaaS base debe funcionar impecablemente antes de añadir integraciones complejas.

3. **Pocos restaurantes en Fase 1 lo necesitan:** Al principio, los restaurantes objetivo son los que no tienen POS o tienen sistemas simples. Los que tienen FUDO/BISTROSOFT son generalmente más grandes y pueden ser un target de Fase 2 o 3.

4. **Riesgos de bugs críticos:** Un error en la inyección puede resultar en pedidos pagados que no llegan a cocina. El impacto en la reputación del restaurante (y de TakeasyGO) es severo.

### Recomendación estratégica

```
FASE 1 (ahora):
  ✗ No implementar integración POS todavía
  ✓ Documentar la arquitectura (este documento)
  ✓ Usar TakeasyGO como sistema standalone
  ✓ Panel de órdenes de TakeasyGO = suficiente para operar

FASE 2 (10-30 restaurantes activos):
  ✓ Implementar integración con FUDO (la más documentada)
  ✓ Testear con 1-2 restaurantes piloto
  ✓ Usar como argumento de venta para restaurantes medianos

FASE 3 (escala):
  ✓ Integrar BISTROSOFT previa negociación directa
  ✓ Evaluar Deliverect como middleware universal
  ✓ Construir arquitectura de "POS Connector" genérica
```

---

## 11. ARQUITECTURA TÉCNICA PROPUESTA (para cuando se implemente)

### 11.1 Capa de abstracción: POSConnector

En lugar de hacer código directamente contra FUDO o BISTROSOFT, crear una interfaz genérica:

```typescript
interface POSConnector {
  // Verificar que las credenciales son válidas
  testConnection(credentials: POSCredentials): Promise<boolean>

  // Obtener catálogo del restaurante desde el POS
  getCatalog(): Promise<POSCatalogItem[]>

  // Inyectar pedido en el POS
  injectOrder(order: TakeasyGoOrder): Promise<POSOrderResult>

  // Verificar el estado de un pedido en el POS
  getOrderStatus(posOrderId: string): Promise<POSOrderStatus>
}
```

Cada POS implementa esta interfaz:

```typescript
class FudoConnector implements POSConnector { ... }
class BistrosoftConnector implements POSConnector { ... }
```

Esto facilita agregar nuevos POS en el futuro sin cambiar la arquitectura central.

---

### 11.2 Modelo de datos: Configuración de integración POS

Agregar al modelo `Restaurante` en MongoDB:

```typescript
posIntegration?: {
  provider: 'fudo' | 'bistrosoft' | 'none'
  enabled: boolean
  credentials: {
    clientId: string          // Cifrado AES-256
    clientSecret: string      // Cifrado AES-256
    apiEndpoint?: string      // URL base de la API (si es configurable)
  }
  productMapping: {
    takeasygGoItemId: string  // ObjectId del item en TakeasyGO
    posItemId: string         // ID del item en el POS
    posItemName: string       // Para referencia visual del admin
  }[]
  lastSyncAt?: Date           // Última sincronización de catálogo
  webhookSecret?: string      // Para verificar autenticidad de webhooks del POS
}
```

---

### 11.3 Endpoint de webhook del POS (TakeasyGO recibe)

```
POST /api/webhooks/pos/{tenantSlug}

Headers:
  X-POS-Signature: [firma HMAC del payload]
  X-POS-Provider: fudo | bistrosoft

Body:
{
  "event": "ORDER-CONFIRMED",
  "orderId": "[ID del pedido en el POS]",
  "externalOrderId": "[ID del pedido en TakeasyGO]",
  "timestamp": "2026-04-08T12:00:00Z"
}
```

TakeasyGO:
1. Verifica la firma HMAC
2. Busca la orden por `externalOrderId`
3. Actualiza el estado en MongoDB
4. Emite evento SSE al cliente para tracking en tiempo real

---

### 11.4 Endpoint de inyección (TakeasyGO envía al POS)

Payload que TakeasyGO enviaría a FUDO al crear un pedido:

```json
{
  "externalId": "REST-20260408-042",
  "customer": {
    "name": "Juan Pérez",
    "phone": "+5491112345678"
  },
  "type": "takeaway",
  "items": [
    {
      "posItemId": "fudo-item-id-123",
      "quantity": 2,
      "notes": "sin cebolla",
      "modifiers": [
        {
          "posModifierId": "fudo-mod-id-456",
          "name": "Extra queso"
        }
      ]
    }
  ],
  "notes": "Retira en 20 minutos",
  "total": 2400.00,
  "paymentMethod": "mercadopago",
  "paymentStatus": "approved"
}
```

El campo `externalId` es el número de orden de TakeasyGO. Esto permite rastrearlo en ambos sistemas.

---

## 12. COMPARATIVA FUDO vs BISTROSOFT

| Criterio | FUDO | BISTROSOFT |
|---|---|---|
| **API de inyección de pedidos** | ✅ Existe (Beta) | ⚠️ No confirmada públicamente |
| **Documentación pública** | ✅ En Centro de Ayuda | ❌ Privada, gestión directa |
| **Forma de acceso** | Credenciales generadas por el restaurante | Contacto commercial con BISTROSOFT |
| **Webhooks de estado** | ✅ Documentados | ⚠️ No confirmados |
| **Quién genera las credenciales** | El restaurante (self-service) | BISTROSOFT (caso a caso) |
| **Plan requerido** | Plan Pro o por mesas | Licencia PRO |
| **Complejidad de integración** | Media | Alta |
| **Riesgo para TakeasyGO** | Bajo-Medio | Medio-Alto |
| **Tiempo estimado de implementación** | 2-4 semanas | Depende de la negociación |
| **Mercado principal** | AR, MX, LATAM | AR, MX, ES |

---

## 13. MODELO ALTERNATIVO: VÍA MIDDLEWARE (DELIVERECT)

Deliverect es un agregador de integraciones para restaurantes. Actúa como puente entre plataformas de pedidos y sistemas POS.

**Ya tiene integración nativa con:**
- BISTROSOFT ✅
- FUDO (evaluar)
- Muchos otros POS del mercado

**Modelo:**
```
TakeasyGO ──pedido──► Deliverect ──inyecta──► FUDO / BISTROSOFT / cualquier POS
```

**Ventajas:**
- Una sola integración de TakeasyGO (con Deliverect)
- Deliverect maneja los conectores con cada POS
- Reduce el trabajo de mantenimiento de TakeasyGO

**Desventajas:**
- Deliverect cobra por uso (costo adicional para el restaurante o TakeasyGO)
- Agrega una capa de dependencia externa
- Menos control sobre el flujo de datos
- El restaurante necesita tener cuenta en Deliverect además de TakeasyGO y el POS

**¿Cuándo usar este modelo?** Si TakeasyGO quiere escalar a muchos POS rápidamente sin construir conectores individuales. Es el modelo "plataforma" en lugar del modelo "integración directa".

---

## 14. PASOS CONCRETOS A SEGUIR (ACCIÓN)

### Para FUDO (cuando se decida avanzar)

```
[ ] 1. Conseguir acceso a una cuenta FUDO Plan Pro para pruebas
[ ] 2. Solicitar habilitación de API en soporte@fu.do
[ ] 3. Obtener documentación completa de la API de inyección
[ ] 4. Revisar documentación de webhooks disponibles
[ ] 5. Construir FudoConnector en TakeasyGO (TypeScript)
[ ] 6. Agregar campo posIntegration al modelo Tenant en MongoDB
[ ] 7. Crear sección "Integraciones" en el panel admin (Settings)
[ ] 8. Implementar UI de mapeo de productos
[ ] 9. Crear endpoint webhook /api/webhooks/pos/[slug]
[ ] 10. Testear con restaurante piloto real
[ ] 11. Documentar el proceso de activación para el restaurante
```

### Para BISTROSOFT (cuando se decida avanzar)

```
[ ] 1. Contactar a BISTROSOFT Argentina (soporte: +54 11 3775-7552)
[ ] 2. Presentar TakeasyGO: qué es, qué queremos hacer, cuántos restaurantes manejamos
[ ] 3. Preguntar específicamente por: "API de inyección de pedidos externos"
[ ] 4. Evaluar si requiere partnership formal o solo credenciales técnicas
[ ] 5. Evaluar costos y condiciones del acuerdo
[ ] 6. Si hay API → construir BistrosoftConnector
[ ] 7. Si no hay API de inyección → evaluar via Deliverect como alternativa
```

---

## 15. PREGUNTAS FRECUENTES

**¿TakeasyGO tiene que construir una API para que el POS se conecte?**
No. El POS ya tiene su API. TakeasyGO la consume. TakeasyGO sí debe construir un endpoint de webhook para recibir notificaciones del POS.

**¿El restaurante tiene que darme su usuario y contraseña de FUDO?**
No. El restaurante genera credenciales específicas de integración (`client_id` y `client_secret`) desde su panel de FUDO. No son sus credenciales de login. Es seguro y el restaurante puede revocarlas cuando quiera.

**¿Tengo que firmar un acuerdo con FUDO?**
Para el modelo actual (el restaurante genera credenciales self-service), no necesariamente. Si TakeasyGO quiere ser un "partner oficial" de FUDO o aparecer en su marketplace de integraciones, sí habría un proceso de partnership. Para empezar, no es obligatorio.

**¿Qué pasa si el restaurante usa FUDO Y también quiere usar el panel de TakeasyGO para gestionar órdenes?**
Puede. Los dos sistemas estarían sincronizados. Pero hay que definir quién "manda" sobre el estado de la orden para evitar conflictos. La recomendación es que con la integración activa, el estado en TakeasyGO sea solo lectura (actualizado por los webhooks del POS).

**¿Vale la pena para TODOS los restaurantes?**
No. Restaurantes pequeños o sin POS no lo necesitan. Esta integración es valiosa para restaurantes medianos/grandes que ya usan un POS y no quieren cambiar su flujo operativo interno.

**¿Bistrosoft tiene algo similar a la API de orden de FUDO?**
Públicamente no está confirmado. Su API orientada a datos (BI) existe, pero la de orden en tiempo real requiere contacto directo. Esto puede cambiar con el tiempo.

---

## 16. GLOSARIO

| Término | Definición |
|---|---|
| **POS** | Point of Sale — Sistema de punto de venta para restaurantes |
| **Order Injection** | Proceso de crear un pedido externo dentro del sistema POS |
| **Webhook** | Notificación HTTP que un sistema envía a otro cuando ocurre un evento |
| **client_id / client_secret** | Par de credenciales para autenticar una aplicación contra una API |
| **API** | Application Programming Interface — interfaz que permite que dos sistemas se comuniquen |
| **Deliverect** | Middleware de integración entre plataformas de pedidos y sistemas POS |
| **Tenant** | Restaurante individual dentro del SaaS multi-tenant TakeasyGO |
| **Payload** | Datos que se envían en una llamada a la API |
| **HMAC** | Hash-based Message Authentication Code — firma criptográfica para verificar webhooks |
| **Mapping / Mapeo** | Tabla que relaciona los IDs de productos de un sistema con los de otro |

---

> **Nota final:** Este documento es una base técnica y estratégica. La información sobre FUDO está basada en su documentación pública y centro de ayuda (abril 2026). La información sobre BISTROSOFT está basada en su sitio público; los detalles de su API de inyección requieren confirmación directa. Antes de iniciar el desarrollo, verificar que la documentación sigue vigente contactando al soporte de cada POS.
