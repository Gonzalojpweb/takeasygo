Club de Fidelización TakeasyGO — Plan de Implementación
Resumen ejecutivo
Construir un sistema de fidelización por fases, donde la Fase 1 se enfoca exclusivamente en construir la base de miembros de cada restaurante. Sin puntos, sin canjes, sin reglas complejas. Solo capturar la red de clientes leales de cada tenant — tanto online como presenciales — darles una identidad dentro del club, y darle al restaurante visibilidad real de quiénes son sus clientes recurrentes.

La filosofía correcta: primero construir la comunidad, después definir los beneficios.

IMPORTANT

El plan contempla tres canales de entrada al club: checkout online (takeaway), QR presencial (dine-in y visita al local), y registro manual por el admin. Ninguno requiere compra previa.

Por qué esta secuencia es la correcta
El error más común en programas de fidelización es empezar con reglas complejas de puntos antes de tener miembros. El resultado: nadie se suma porque no entienden el sistema, y el restaurante no tiene masa crítica para hacer que los beneficios sean atractivos.

Al construir la red primero TakeasyGO gana tres cosas:

Data real de quiénes son los clientes más valiosos de cada restaurante (antes de definir cómo recompensarlos)
Encuestas con sustento: cuando preguntes a restaurantes "¿qué quieren ofrecer como beneficio?", ya tendrán datos sobre su propia base de clientes
El club ya existe cuando salgan los beneficios — los miembros reciben la novedad, no tienen que unirse de cero
Visión del producto (Fase 1 + futuro)
FASE 1: Construir la red
━━━━━━━━━━━━━━━━━━━━━━
→ Canal A: cliente escanea QR en el local y se registra en 30 segundos (sin compra previa)
→ Canal B: cliente hace pedido online y hace opt-in al club en el checkout
→ Canal C: el admin registra manualmente clientes VIP o basa de contactos existente
→ El restaurante ve su lista de miembros con historial básico
→ El cliente tiene su "tarjeta digital de miembro" del restaurante
→ Sistema listo para recibir reglas de puntos cuando estén definidas
FASE 2: Activar beneficios (post-encuesta)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Definir criterios de puntos según encuestas
→ Asignar puntos retroactivamente a miembros existentes
→ Crear sistema de canjes
FASE 3: Red TakeasyGO (largo plazo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ El club trasciende al restaurante individual
→ Un cliente puede ser miembro de varios restaurantes
→ Network effect de la plataforma
Qué se construye en Fase 1
1. Modelo de datos: LoyaltyMember
Nuevo modelo en MongoDB. Un documento por cada cliente por restaurante (tenant).

typescript
// models/LoyaltyMember.ts
{
  tenantId: ObjectId          // a qué restaurante pertenece
  
  // Identificación del cliente
  name: string                // nombre
  email: string               // email (indexado, puede ser vacío)
  phone: string               // teléfono (indexado, puede ser vacío)
  phoneHash: string           // hash para seguimiento anónimo (igual que en Order)
  
  // Estado de membresía
  status: 'active' | 'inactive' | 'blocked'
  joinedAt: Date              // cuándo se unió
  
  // Fuente de registro
  source: 'checkout' | 'qr_scan' | 'admin' | 'manual_import'
  
  // Actividad (calculada desde órdenes — no se almacena, se computa)
  // Pero se cachea para performance:
  cache: {
    totalOrders: number       // total de órdenes completadas
    totalSpent: number        // gasto total histórico
    lastOrderAt: Date | null  // última orden
    updatedAt: Date           // cuando se actualizó la caché
  }
  // Preparado para Fase 2 (vacío en Fase 1)
  loyalty: {
    points: number            // default: 0
    tier: 'none' | 'bronze' | 'silver' | 'gold'  // default: 'none'
  }
  
  notes: string               // nota interna del admin
  createdAt: Date
  updatedAt: Date
}
Índices clave:

(tenantId, phoneHash) — para vincular automáticamente órdenes con miembros
(tenantId, email) — búsqueda por email
(tenantId, status, joinedAt) — listado paginado
2. Puntos de entrada al club — Los tres canales
El club tiene tres canales de ingreso. Ninguno obliga al cliente a comprar primero.

Canal A — QR presencial (el más importante)
Este es el canal que captura al cliente que el plan anterior ignoraba: el habitual del local. El vecino que va todas las semanas a comer, el que viene a buscar su pedido sin haber pedido online, el que se sienta a comer en el salón.

Cómo funciona:

El restaurante tiene un QR imprimible generado por TakeasyGO
El cliente lo escanea desde la mesa, el mostrador, una tarjetita, o incluso un flyer
El QR abre una página pública de registro: takeasygo.com/r/[slug]/club
El cliente ve una página con el branding del restaurante y un formulario mínimo:
┌──────────────────────────────────────────┐
│  🏠 Club [Nombre del Restaurante]        │
│                                          │
│  Sumarte es gratis y tarda 30 segundos   │
│                                          │
│  Nombre *        [_____________________] │
│  Teléfono *      [_____________________] │
│  Email           [_____________________] │
│  (opcional)                              │
│                                          │
│  [ Quiero ser parte del club ]  ← botón  │
│                                          │
│  Sin spam. Podés darte de baja cuando    │
│  quieras.                                │
└──────────────────────────────────────────┘
Al confirmar → el cliente es miembro. Pantalla de bienvenida con su "tarjeta digital"
Sin cuenta, sin login, sin contraseña. Solo nombre + teléfono
El QR funciona para todos los escenarios:

Mesa en el salón (dine-in) → en la mesa, en el menú físico, en el mantel
Mostrador de takeaway → en la caja, en el mostrador, en el empaque
Redes sociales → el restaurante puede compartir el link en Instagram
Tarjeta de visita → el restaurante lo imprime y lo da en mano
Deduplicación: Si el teléfono ya existe como miembro en ese tenant → simplemente muestra la tarjeta del club existente (no crea duplicado)

Canal B — Opt-in en el checkout online
Para clientes que hacen pedido takeaway por TakeasyGO. El cliente ya está llenando su nombre y teléfono. Un solo campo adicional es suficiente.

Implementación: Agregar al formulario de checkout (debajo de los datos del cliente):

☐ Quiero unirme al Club [Nombre del Restaurante]  ← checkbox, desmarcado por defecto
Mensaje: "Recibí novedades y beneficios exclusivos. Sin spam."
Lógica:

Si marca el checkbox Y ya es miembro (por QR previo) → vincular orden, actualizar caché
Si marca el checkbox Y es nuevo → crear LoyaltyMember (source: checkout)
Si no marca → no hacer nada (siempre opt-in, nunca forzado)
Canal C — Alta manual por el admin
El restaurante puede dar de alta a clientes directamente desde su panel. Útil para:

Importar su base de clientes existente
Registrar a alguien que lo pidió en persona pero no tenía el teléfono a mano para escanear
Clientes VIP que el restaurante quiere incorporar directamente
Formulario en el panel admin: nombre, teléfono, email (opcional), nota interna.

3. Panel admin: Sección "Mi Club"
Nueva sección en el panel del restaurante. Acceso desde el menú lateral.

Vista principal — Lista de miembros
Tabla con: nombre, teléfono/email, fecha de ingreso, total de pedidos, último pedido, estado
Filtros: por estado (activo/inactivo), por fuente (checkout/manual), por fecha de ingreso
Búsqueda: por nombre, email, teléfono
Ordenamiento: por fecha de ingreso, por total de pedidos, por gasto total
Tarjetas de resumen (KPIs del club)
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Total miembros │  │  Nuevos este mes│  │ Activos (90d)   │  │ Tasa de recompra│
│      142        │  │      +18        │  │      87         │  │     61%         │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
Perfil de miembro (vista de detalle)
Al hacer click en un miembro:

Datos del cliente
Historial de pedidos dentro de este restaurante (los últimos 10)
Total gastado, ticket promedio
Campo de notas internas del admin
Botón: desactivar / bloquear miembro
Agregar miembro manualmente
Un formulario simple para que el admin pueda registrar manualmente clientes que vengan en persona o que el restaurante tenga en su base de contactos.

4. Experiencia del cliente: confirmación de membresía
Después del pedido, cuando el cliente hace opt-in al club, la pantalla de éxito muestra:

✅ Tu pedido está confirmado
Número #REST-20260408-042
━━━━━━━━━━━━━━━━━━━━━━━
🎉 ¡Ahora sos parte del
   Club [Nombre Restaurante]!
   "Gracias por sumarte. 
    Próximamente tendremos 
    beneficios para vos."
━━━━━━━━━━━━━━━━━━━━━━━
Sin promesas específicas. Sin puntos inventados. Solo la bienvenida.

5. Configuración del club para el restaurante
En settings del restaurante, nueva pestaña "Club de Fidelización":

Estado del club: activado / desactivado (si está desactivado, no aparece el checkbox en el checkout)
Nombre del club: "Club [Nombre Restaurante]" (personalizable)
Mensaje de bienvenida: texto que aparece al unirse (editable)
Integración con datos existentes
Esta es la parte inteligente: TakeasyGO ya tiene historial de pedidos con phoneHash. Se puede vincular automáticamente.

Proceso de enrolamiento automático
Cuando un cliente existente se une al club, TakeasyGO puede:

Buscar órdenes anteriores con el mismo phoneHash
Calcular el historial real (total de pedidos, gasto, primera orden)
Pre-cargar la caché del miembro con datos históricos reales
El cliente que llevaba 6 meses pidiendo se une al club y ya tiene actividad acumulada. Eso es mucho más poderoso que empezar desde cero.

Actualización de caché post-pedido
Cuando un pedido se entrega (status: 'delivered' y payment.status: 'approved'):

TakeasyGO busca si el número de teléfono tiene un LoyaltyMember activo en ese tenant
Si lo tiene → actualiza cache.totalOrders, cache.totalSpent, cache.lastOrderAt
Esto mantiene los datos del club siempre frescos sin cálculos pesados en tiempo real
Plan de implementación técnica
Etapa 1 — Modelo y base (2-3 días)
[ ] Crear models/LoyaltyMember.ts
[ ] Agregar índices apropiados
[ ] Agregar campo 'loyalty' en Tenant (configuración del club)
[ ] Actualizar lib/plans.ts con feature 'loyaltyClub'
Etapa 2 — API (4-5 días)
[ ] POST  /api/[tenant]/loyalty/join            → opt-in desde checkout (requiere auth de orden)
[ ] POST  /api/[tenant]/loyalty/register        → registro público vía QR (sin auth, con rate limit)
[ ] GET   /api/[tenant]/loyalty/check           → verificar si un teléfono ya es miembro
[ ] GET   /api/[tenant]/admin/loyalty/members   → lista paginada con filtros
[ ] GET   /api/[tenant]/admin/loyalty/members/[id] → detalle de miembro
[ ] POST  /api/[tenant]/admin/loyalty/members   → alta manual desde el panel
[ ] PATCH /api/[tenant]/admin/loyalty/members/[id] → editar datos / cambiar estado
[ ] GET   /api/[tenant]/admin/loyalty/stats     → KPIs del club
[ ] GET   /api/[tenant]/admin/loyalty/qr        → datos del QR (URL y configuración)
[ ] Hook en lógica de entrega de orden          → actualizar caché del miembro por phoneHash
Etapa 3 — Página pública de registro por QR (2-3 días)
[ ] Crear ruta pública: /r/[slug]/club  (sin autenticación)
[ ] Página con branding del restaurante (logo, colores del tenant)
[ ] Formulario: nombre (req), teléfono (req), email (opcional)
[ ] Validación de teléfono con formato local
[ ] Lógica de deduplicación: si el teléfono ya existe → mostrar tarjeta existente (no error)
[ ] Pantalla de bienvenida post-registro con nombre del restaurante y mensaje configurable
[ ] "Tarjeta digital" del miembro: nombre, restaurante, fecha de ingreso
[ ] Rate limiting: máximo 3 registros por IP/10 minutos (anti-spam)
Etapa 4 — UI checkout (1-2 días)
[ ] Agregar checkbox opt-in en el formulario de checkout (condicional a que el club esté activo)
[ ] Checkbox desmarcado por defecto
[ ] Lógica de llamado a /loyalty/join cuando se confirma el pedido (solo si está marcado)
[ ] Actualizar pantalla de éxito: si se unió al club → mostrar bienvenida
[ ] Si ya era miembro → mostrar "Ya sos parte del club 🎉" (sin duplicar registro)
Etapa 5 — Panel admin (4-5 días)
[ ] Crear página /admin/loyalty (solo si el plan tiene acceso)
[ ] Componente de tarjetas de KPIs del club
[ ] Tabla de miembros con filtros, búsqueda y paginación (con columna "Fuente de ingreso")
[ ] Página de detalle de miembro con historial de órdenes
[ ] Formulario de alta manual de miembro
[ ] Sección de QR: vista previa + botón de descarga (PNG imprimible)
[ ] Sección de configuración del club en Settings
Etapa 6 — Integración con histórico (1 día)
[ ] Al crear un nuevo LoyaltyMember → buscar órdenes históricas por phoneHash
[ ] Calcular y guardar caché inicial con datos reales
Estimación total: 3 a 4 semanas de desarrollo.

En qué plan va esta feature
IMPORTANT

Esta decisión es clave. El club de fidelización puede ser un diferencial que justifique un plan superior o un gancho para todos.

Opción A — Feature exclusiva de plan Crecimiento y Premium
Pro: Incentiva el upgrade. El restaurante tiene que crecer para tener el club.
Con: Los restaurantes en plan Trial/Inicial (los que más necesitan construir comunidad) no acceden.
Opción B — Feature disponible en todos los planes (con límites)
Trial: Club habilitado, hasta 30 miembros (alinea con el límite de 30 pedidos del trial)
Inicial: Club habilitado, hasta 150 miembros
Crecimiento: Club sin límite + export de lista
Premium: Todo lo anterior + métricas avanzadas del club (retención, frecuencia, segmentación)
Recomendación: Opción B. El club es un "gancho" que hace que los restaurantes quieran que sus clientes usen más TakeasyGO. Cuantos más restaurantes tengan el club activo, más datos se acumulan en la plataforma. Eso es valioso para el ICO y el algoritmo de visibilidad futuro.

Preparación para Fase 2 (puntos y canjes)
El modelo ya tiene los campos listos (loyalty.points, loyalty.tier). Cuando se definan las reglas de puntos (post-encuesta), los cambios son:

Agregar lógica de cálculo de puntos al hook post-pedido
Crear reglas de acumulación (ej: 1 punto por cada $100 gastados)
Crear sistema de canjes (descuentos, productos gratis, etc.)
Actualizar loyalty.tier según umbral de puntos
Los miembros existentes pueden recibir puntos retroactivos basados en su historial
Nada de esto requiere cambiar la estructura del modelo.

Encuesta sugerida para definir Fase 2
Una vez que el club esté corriendo y haya datos, hacer esta encuesta al restaurante:

¿Qué beneficio le parece más valioso para su cliente?: a) Descuento en el próximo pedido / b) Producto gratis / c) Acceso anticipado a novedades / d) Acumulación de crédito en dinero
¿Qué comportamiento quieren incentivar más?: a) Frecuencia de pedidos / b) Gasto mayor / c) Traer amigos nuevos / d) Pedir en horarios poco activos
¿Con qué frecuencia quieren ofrecer un beneficio?: a) Por cada pedido / b) Cada 5 pedidos / c) Una vez al mes / d) En fechas especiales
Las respuestas a esas 3 preguntas definen prácticamente todo el sistema de puntos.

Riesgos
Riesgo	Impacto	Mitigación
Los restaurantes no activan el club	Bajo	Onboarding activo, mostrar el valor desde el primer miembro
Los clientes no hacen opt-in en el checkout	Medio	Diseño atractivo del checkbox. El QR presencial es el canal principal de todas formas
Spam de registros en la página pública del QR	Medio	Rate limiting por IP, validación de formato de teléfono, sin envío de emails automáticos en Fase 1
Confusión sobre qué son los "puntos" (sin reglas aún)	Bajo	No mencionar puntos. El club es solo pertenencia e identidad
Mismo cliente registrado con teléfonos distintos	Bajo	Identificador principal es phoneHash. No es técnicamente evitable 100% pero es raro
El restaurante no imprime el QR	Medio	Proveer el QR en formato PNG de alta resolución listo para imprimir. Instrucciones simples
Privacy / protección de datos	Medio	Opt-in explícito, mensaje claro de "sin spam", posibilidad de baja, datos aislados por tenant
Resumen de decisiones pendientes que requieren tu aprobación
IMPORTANT

Antes de implementar, necesito que definas:

¿En qué plan va el Club? → Recomiendo Opción B (disponible en todos, con límites por plan)
¿Límites de miembros por plan? → Propongo: Trial 30 / Inicial 150 / Crecimiento ilimitado / Premium ilimitado
¿El opt-in en checkout es opt-in (marcado por defecto) o opt-out (desmarcado)? → Recomiendo opt-in (desmarcado por defecto, más ético y legal)
¿Exportación de lista de miembros en qué plan? → Recomiendo desde Crecimiento
¿El nombre del club lo pone el restaurante o es siempre "Club [Nombre Restaurante]"? → Recomiendo que sea configurable desde Settings
