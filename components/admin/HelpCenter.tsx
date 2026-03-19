'use client'

import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, BarChart3,
  Settings, Printer, ClipboardList, Shield, Activity, CalendarDays,
  CreditCard, Search, ChevronRight, X, Zap, TrendingUp, BookOpen,
  Target, CheckCircle2, Lock, Star, HelpCircle, ArrowRight,
  Sparkles, Package, Clock, Bell, FileText, Globe, Palette, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanBadge = 'todos' | 'inicial' | 'crecimiento' | 'premium'
type RoleBadge = 'admin' | 'gerente' | 'staff' | 'cajero'

interface Step {
  action: string
  detail?: string
}

interface Section {
  id: string
  icon: React.ElementType
  label: string
  color: string
  bgColor: string
  plan: PlanBadge
  roles: RoleBadge[]
  objective: string
  description: string
  features: { title: string; desc: string }[]
  steps?: Step[]
  tips?: string[]
}

// ── Data ──────────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    color: 'text-violet-600',
    bgColor: 'bg-violet-500/10',
    plan: 'todos',
    roles: ['admin', 'gerente', 'staff', 'cajero'],
    objective: 'Tener una vista rápida del estado actual de tu negocio sin entrar en cada módulo.',
    description: 'El Dashboard es la pantalla de inicio del panel. Concentra la información más importante de tu operación en tiempo real: pedidos activos, alertas, score ICO y actividad reciente.',
    features: [
      { title: 'Tarjetas de estado', desc: 'Contadores de pedidos totales, pendientes, confirmados y cancelados del día.' },
      { title: 'Gauge ICO', desc: 'Score de Fiabilidad Operativa visible de un vistazo. Verde = operación sólida. Rojo = hay problemas a resolver.' },
      { title: 'Alertas operativas', desc: 'Avisos automáticos cuando hay pedidos sin confirmar por más de 10 minutos o situaciones que requieren atención.' },
      { title: 'Pedidos recientes', desc: 'Lista de las últimas órdenes con nombre del cliente, total y estado actual.' },
      { title: 'Widget de calificaciones', desc: 'Resumen de las valoraciones recibidas de los clientes.' },
      { title: 'Checklist de onboarding', desc: 'Para cuentas nuevas: guía paso a paso para completar la configuración inicial.' },
    ],
    tips: [
      'Revisá el Dashboard cada mañana antes de abrir para detectar pedidos pendientes de la noche anterior.',
      'Si el gauge ICO está en rojo, entrá al módulo ICO para ver qué factor está fallando y cómo mejorarlo.',
      'Las alertas desaparecen automáticamente cuando se resuelve la situación.',
    ],
  },
  {
    id: 'pedidos',
    icon: ShoppingBag,
    label: 'Pedidos',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10',
    plan: 'inicial',
    roles: ['admin', 'gerente', 'staff', 'cajero'],
    objective: 'Gestionar en tiempo real todos los pedidos entrantes: confirmarlos, prepararlos y marcarlos como listos para que el cliente retire.',
    description: 'El módulo de Pedidos es el corazón operativo del día a día. Acá trabajás vos y tu equipo durante el servicio. Muestra todos los pedidos activos organizados por estado y permite avanzarlos en el flujo de preparación.',
    features: [
      { title: 'Vista en tiempo real', desc: 'Los pedidos aparecen automáticamente al llegar, sin necesidad de refrescar la página.' },
      { title: 'Flujo de estados', desc: 'Pendiente → Confirmado → Preparando → Listo → Entregado. Cada cambio notifica al cliente.' },
      { title: 'Indicadores de carga', desc: 'Métricas de cuántos pedidos llegaron en los últimos 30 y 60 minutos para anticipar picos.' },
      { title: 'Detalle del pedido', desc: 'Al abrir un pedido podés ver los ítems, customizaciones, notas del cliente y datos de contacto.' },
      { title: 'Impresión de ticket', desc: 'Botón de impresión manual en cada pedido, además de la impresión automática al confirmar.' },
      { title: 'Filtros por sede', desc: 'Si tenés múltiples sedes, podés filtrar la vista por local.' },
    ],
    steps: [
      { action: 'Entra al módulo Pedidos', detail: 'Verás los pedidos en estado Pendiente organizados por hora de llegada.' },
      { action: 'Confirmá el pedido', detail: 'Tocá "Confirmar" para aceptarlo. El cliente recibe notificación y empieza el contador de tiempo.' },
      { action: 'Cambiá a Preparando', detail: 'Cuando el equipo de cocina empieza, pasá el pedido a este estado.' },
      { action: 'Marcá como Listo', detail: 'Al finalizar la preparación. El cliente recibe notificación para ir a retirar.' },
      { action: 'Marcá como Entregado', detail: 'Al momento de la entrega física al cliente.' },
    ],
    tips: [
      'Confirmá los pedidos lo más rápido posible — el tiempo desde que llega hasta que se confirma impacta directamente en tu score ICO.',
      'Las notas del cliente aparecen destacadas en el detalle del pedido. Revisalas siempre antes de empezar a preparar.',
      'Podés imprimir el ticket en cualquier momento desde el detalle del pedido si la impresión automática falla.',
    ],
  },
  {
    id: 'menu',
    icon: UtensilsCrossed,
    label: 'Menú',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10',
    plan: 'todos',
    roles: ['admin', 'gerente'],
    objective: 'Crear y mantener actualizado el menú digital que verán tus clientes al escanear el QR o acceder al link.',
    description: 'El módulo de Menú es donde construís toda la oferta gastronómica de tu restaurante. Desde acá podés agregar categorías, ítems con fotos y precios, customizaciones, disponibilidad horaria y configurar el sistema de upselling inteligente.',
    features: [
      { title: 'Categorías', desc: 'Organizá tu menú en secciones (Entradas, Platos, Postres, Bebidas, etc.) con imagen, descripción y orden personalizable.' },
      { title: 'Ítems con imagen', desc: 'Cada producto puede tener foto, precio, descripción, tags (vegetariano, vegano, etc.) y marcarse como destacado.' },
      { title: 'Customizaciones', desc: 'Grupos de opciones por ítem: elección de punto de cocción, extras, salsas, etc. Pueden ser obligatorias u opcionales, con precio extra.' },
      { title: 'Disponibilidad programada', desc: 'Configurá días y horarios en que cada ítem o categoría está disponible. Fuera del horario, el ítem se oculta automáticamente.' },
      { title: 'Menú bilingüe', desc: 'Traducción automática al inglés con IA. Tus clientes pueden ver el menú en su idioma.' },
      { title: 'Productos destacados', desc: 'Marcá ítems como "Featured" para que aparezcan en la sección de destacados al tope del menú y en las sugerencias de upselling.' },
      { title: 'Sugerir junto a (Upselling manual)', desc: 'Para cada ítem, podés elegir qué otros productos sugerir cuando ese ítem se agrega al carrito. Esto activa la Capa 0 del upselling.' },
      { title: 'Importación CSV', desc: 'Subí tu menú completo desde un archivo Excel/CSV en vez de cargarlo ítem por ítem.' },
      { title: 'Link y QR por sede', desc: 'Cada ubicación tiene su propio link público y código QR para compartir o imprimir.' },
    ],
    steps: [
      { action: 'Creá las categorías primero', detail: 'Antes de agregar ítems, definí la estructura: Entradas, Platos principales, Postres, Bebidas.' },
      { action: 'Agregá los ítems a cada categoría', detail: 'Completá nombre, precio, descripción e imagen. El precio es el único campo obligatorio además del nombre.' },
      { action: 'Configurá las customizaciones', detail: 'Si un ítem tiene opciones (punto de cocción, extras), creá los grupos de customización.' },
      { action: 'Marcá los destacados', detail: 'Activá isFeatured en tus mejores platos para que aparezcan en el carrusel de destacados.' },
      { action: 'Configurá el upselling manual', detail: 'En "Sugerir junto a", elegí qué productos complementan cada ítem (bebidas con platos, postre con principal, etc.).' },
      { action: 'Revisá el menú público', detail: 'Usá el link "Ver menú" para ver exactamente cómo lo ve tu cliente.' },
    ],
    tips: [
      'Las fotos hacen una diferencia enorme. Un menú con imágenes convierte hasta 3 veces más que uno sin fotos.',
      'Configurá el "Sugerir junto a" en tus 5 ítems más vendidos. Ese es el 80% del impacto del upselling.',
      'Usá la disponibilidad programada para ítems de temporada o de horario especial (desayuno, brunch, etc.).',
      'Si tenés muchos ítems, la importación CSV es mucho más rápida que cargar uno por uno.',
    ],
  },
  {
    id: 'upselling',
    icon: Sparkles,
    label: 'Sistema de Upselling',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    plan: 'inicial',
    roles: ['admin', 'gerente'],
    objective: 'Aumentar el ticket promedio sugiriendo productos complementarios en el momento exacto en que el cliente está comprando.',
    description: 'El sistema de upselling inteligente funciona automáticamente en el menú digital de tus clientes. Cuando alguien agrega un producto al carrito, el sistema sugiere otros ítems relevantes. Tiene tres capas de inteligencia que se activan progresivamente.',
    features: [
      { title: 'Capa 0 — Manual (admin configura)', desc: 'Vos decidís exactamente qué sugerir con cada ítem. Configurás en el módulo Menú → ítem → "Sugerir junto a". Tiene prioridad máxima.' },
      { title: 'Capa 1 — Comportamental (automática)', desc: 'El sistema analiza los últimos 90 días de órdenes y detecta qué productos se piden juntos frecuentemente. Se activa sola cuando hay historial suficiente.' },
      { title: 'Capa 2 — Estática (fallback desde el día 1)', desc: 'Sin historial ni configuración, el sistema sugiere ítems destacados y add-ons de precio bajo. Funciona desde el primer pedido.' },
      { title: 'UpsellSheet', desc: 'Bottom sheet que aparece automáticamente al agregar un ítem al carrito, mostrando hasta 2 sugerencias relevantes.' },
      { title: 'Banner pre-checkout', desc: 'Antes de pagar, se muestra un banner con ítems destacados que el cliente aún no tiene en su carrito.' },
      { title: 'Analytics de conversión (Premium)', desc: 'En el módulo Reportes, el plan Premium incluye métricas de qué productos se sugirieron, cuántos se agregaron y cuántos terminaron en orden pagada.' },
    ],
    steps: [
      { action: 'Identificá tus combos naturales', detail: 'Pensá en qué productos van bien juntos en tu negocio: bebida + plato, postre + principal, extra + hamburguesa.' },
      { action: 'Configurá el "Sugerir junto a"', detail: 'En Menú → [ítem] → sección "Sugerir junto a". Elegí 1 o 2 productos que tengan sentido junto a ese ítem.' },
      { action: 'Marcá tus destacados', detail: 'Los ítems marcados como "Destacado" se usan en la Capa 2 y el banner pre-checkout.' },
      { action: 'Dejá que el sistema aprenda', detail: 'Con el tiempo, la Capa 1 comportamental va a mejorar las sugerencias automáticamente sin que hagas nada.' },
      { action: 'Medí los resultados (Premium)', detail: 'En Reportes → Analytics de Upselling, podés ver qué productos tienen mejor conversión.' },
    ],
    tips: [
      'Las sugerencias más efectivas son las que tienen sentido gastronómico: no sugerir una entrada junto a un postre.',
      'Los ítems de precio bajo (add-ons, extras) convierten mejor en el UpsellSheet que los platos principales.',
      'No sobrrecargues con sugerencias: el sistema muestra máximo 2. Que sean las correctas.',
    ],
  },
  {
    id: 'usuarios',
    icon: Users,
    label: 'Usuarios',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10',
    plan: 'crecimiento',
    roles: ['admin'],
    objective: 'Dar acceso al panel a tu equipo con el nivel de permisos adecuado para cada rol.',
    description: 'El módulo de Usuarios te permite crear cuentas para cada miembro de tu equipo y asignarles el rol correcto. Cada rol tiene acceso a diferentes módulos del panel para proteger información sensible y dar autonomía operativa sin perder el control.',
    features: [
      { title: 'Roles disponibles', desc: 'Admin (acceso total), Gerente (operación sin billing ni usuarios), Staff (pedidos y menú), Cajero (pedidos e historial).' },
      { title: 'Crear usuarios', desc: 'Ingresá nombre, email y contraseña. El usuario puede cambiar su contraseña después desde el panel.' },
      { title: 'Editar y desactivar', desc: 'Podés cambiar el rol de un usuario en cualquier momento o desactivar su acceso sin eliminarlo.' },
      { title: 'Múltiples usuarios', desc: 'Sin límite de usuarios en planes Crecimiento y Premium.' },
    ],
    steps: [
      { action: 'Creá un usuario por cada persona del equipo', detail: 'Nunca compartas la misma cuenta entre dos personas — así podés identificar quién hizo qué en auditoría.' },
      { action: 'Asigná el rol correcto', detail: 'Staff para cocineros y mosos que solo necesitan ver pedidos. Gerente para encargados que también necesitan ver reportes. Cajero para quien gestiona entregas e historial.' },
      { action: 'Compartí las credenciales de forma segura', detail: 'Enviá usuario y contraseña por separado. El equipo puede iniciar sesión desde cualquier dispositivo.' },
    ],
    tips: [
      'Usá el log de Auditoría para ver qué acciones hizo cada usuario si necesitás revisar algo.',
      'El rol Staff no puede ver reportes ni métricas — ideal para el equipo de cocina.',
      'Si alguien deja el equipo, desactivá su usuario inmediatamente desde este módulo.',
    ],
  },
  {
    id: 'reportes',
    icon: BarChart3,
    label: 'Reportes',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10',
    plan: 'crecimiento',
    roles: ['admin', 'gerente'],
    objective: 'Entender cómo está rindiendo tu negocio con datos reales: ventas, productos, clientes y eficiencia operativa.',
    description: 'El módulo de Reportes concentra todas las métricas de tu operación. Está dividido en dos niveles: reportes básicos disponibles desde el plan Crecimiento, y KPIs operativos avanzados exclusivos del plan Premium.',
    features: [
      { title: 'Revenue del mes', desc: 'Ventas totales del mes actual con comparativa vs el mes anterior y porcentaje de crecimiento.' },
      { title: 'Ticket promedio', desc: 'Cuánto gasta en promedio cada cliente por pedido.' },
      { title: 'Top 5 productos', desc: 'Los ítems más vendidos por unidades y por revenue generado.' },
      { title: 'Tasa de cancelación', desc: 'Porcentaje de pedidos cancelados. Con tendencia vs mes anterior en plan Premium.' },
      { title: 'Exportación Excel / PDF', desc: 'Descargá los reportes del período seleccionado en el formato que necesites.' },
      { title: '⭐ KPIs operativos (Premium)', desc: 'Tiempo de Preparación Promedio (TPP), % pedidos en tiempo, distribución horaria, hora pico, conversión de pagos MercadoPago.' },
      { title: '⭐ Recompra de clientes (Premium)', desc: 'Qué porcentaje de tus clientes vuelven en los últimos 90 días y con qué frecuencia.' },
      { title: '⭐ Revenue por categoría (Premium)', desc: 'Cuánto aporta cada sección del menú al total de ventas.' },
      { title: '⭐ Revenue por sede (Premium)', desc: 'Comparativa de performance entre tus diferentes locales.' },
      { title: '⭐ Analytics de Upselling (Premium)', desc: 'Tasa de conversión y revenue generado por el sistema de sugerencias.' },
      { title: '⭐ Tendencia diaria (Premium)', desc: 'Gráfico de pedidos y ventas por día del mes para identificar patrones.' },
    ],
    tips: [
      'Revisá los reportes una vez por semana como mínimo para detectar tendencias antes de que se conviertan en problemas.',
      'El ticket promedio es el KPI más directo para medir el impacto del upselling.',
      'Si tu tasa de cancelación sube, es una señal de que el equipo está desbordado. Revisá el ICO.',
      'Los datos de recompra son el mejor indicador de satisfacción del cliente a largo plazo.',
    ],
  },
  {
    id: 'ico',
    icon: Activity,
    label: 'ICO — Score Operativo',
    color: 'text-rose-600',
    bgColor: 'bg-rose-500/10',
    plan: 'todos',
    roles: ['admin'],
    objective: 'Tener un diagnóstico objetivo de qué tan bien está funcionando tu operación y qué áreas mejorar para crecer.',
    description: 'El ICO (Índice de Consistencia Operativa) es el score de salud de tu restaurante. Analiza tu historial de pedidos y calcula un puntaje de 0 a 100 basado en factores clave de la operación. Cada plan accede a una versión diferente.',
    features: [
      { title: 'ICO Trial (al cierre)', desc: 'Se genera automáticamente al completar tus primeros 30 pedidos. Es un informe de contexto único que resume tu operación inicial.' },
      { title: 'ICO Simplificado (Crecimiento)', desc: 'Score global con las principales áreas de mejora identificadas. Se actualiza periódicamente.' },
      { title: '⭐ ICO Avanzado (Premium)', desc: 'Diagnóstico completo con desglose por factores, peso de cada dimensión, recomendaciones específicas e historial de evolución del score.' },
      { title: 'Factores evaluados', desc: 'Tiempo de confirmación, tiempo de preparación, tasa de cancelación, tasa de pedidos en tiempo, consistencia horaria y más.' },
      { title: 'Alertas proactivas', desc: 'Cuando el score baja de un umbral, aparece alerta en el Dashboard para que actúes rápido.' },
    ],
    steps: [
      { action: 'Revisá tu score ICO semanal', detail: 'Entrá al módulo ICO y leé el diagnóstico. El score es un reflejo de tu operación real.' },
      { action: 'Identificá el factor que más te baja', detail: 'En el plan Premium, cada factor tiene su propio puntaje. Empezá por el más bajo.' },
      { action: 'Aplicá las recomendaciones', detail: 'El ICO sugiere acciones concretas para mejorar cada factor.' },
      { action: 'Volvé a revisar en 2 semanas', detail: 'Los cambios en la operación se reflejan en el score después de algunos días de datos.' },
    ],
    tips: [
      'El factor más común que baja el ICO es el tiempo de confirmación de pedidos. Configurá notificaciones de audio en el dispositivo que usás para el panel.',
      'Un ICO por encima de 80 indica una operación sólida y consistente.',
      'El ICO no mide ventas — mide eficiencia. Podés vender mucho y tener un ICO bajo si el servicio es inconsistente.',
    ],
  },
  {
    id: 'reservas',
    icon: CalendarDays,
    label: 'Reservaciones',
    color: 'text-teal-600',
    bgColor: 'bg-teal-500/10',
    plan: 'crecimiento',
    roles: ['admin', 'gerente'],
    objective: 'Gestionar las reservas de mesa de tus clientes con vista de calendario y confirmaciones.',
    description: 'El módulo de Reservaciones permite administrar las reservas que hacen tus clientes con anticipación. Podés ver el calendario de ocupación, confirmar o rechazar reservas y gestionar la disponibilidad de mesas.',
    features: [
      { title: 'Vista de calendario', desc: 'Visualizá todas las reservas del mes por día. Identificá de un vistazo qué días están más ocupados.' },
      { title: 'Confirmación de reservas', desc: 'Aceptá o rechazá cada solicitud de reserva con un clic.' },
      { title: 'Gestión de mesas', desc: 'Asigná mesas específicas a cada reserva.' },
      { title: 'Datos del cliente', desc: 'Nombre, teléfono, cantidad de personas y notas especiales de cada reserva.' },
    ],
    tips: [
      'Confirmá las reservas dentro de las 2 horas de recibirlas para que el cliente tenga certeza.',
      'Usá las notas de la reserva para registrar pedidos especiales o alergias.',
    ],
  },
  {
    id: 'impresoras',
    icon: Printer,
    label: 'Impresoras',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
    plan: 'inicial',
    roles: ['admin', 'gerente'],
    objective: 'Configurar las impresoras térmicas para que los tickets de cocina y caja se impriman automáticamente al llegar cada pedido.',
    description: 'El módulo de Impresoras conecta el sistema con tus impresoras térmicas de cocina o caja. Una vez configuradas, cuando llega un pedido nuevo o se confirma, se imprime automáticamente sin que el equipo tenga que hacer nada.',
    features: [
      { title: 'Registro de impresoras', desc: 'Agregá la dirección IP o nombre de red de cada impresora térmica.' },
      { title: 'Asignación por rol', desc: 'Definí qué tickets va a imprimir cada impresora: cocina, barra, caja.' },
      { title: 'Asignación por sede', desc: 'Cada local puede tener sus propias impresoras configuradas de forma independiente.' },
      { title: 'Impresión automática', desc: 'Al confirmar un pedido, el ticket se envía automáticamente a las impresoras configuradas.' },
      { title: 'Impresión manual', desc: 'Desde el detalle de cualquier pedido podés imprimir el ticket manualmente.' },
      { title: 'Límites por plan', desc: 'Trial e Inicial: máximo 1 impresora. Crecimiento y Premium: sin límite.' },
    ],
    steps: [
      { action: 'Conectá la impresora a la red WiFi del local', detail: 'La impresora y el dispositivo donde usás el panel deben estar en la misma red.' },
      { action: 'Obtené la IP de la impresora', detail: 'Generalmente se imprime con un botón de diagnóstico en la impresora.' },
      { action: 'Registrá la impresora en el panel', detail: 'Ingresá la IP, un nombre descriptivo y asignale el rol (cocina, caja, etc.).' },
      { action: 'Hacé una impresión de prueba', detail: 'Usá el botón "Test" para verificar que la conexión funciona.' },
    ],
    tips: [
      'Usá nombres descriptivos para las impresoras: "Cocina Principal", "Barra", "Caja 1".',
      'Si la impresora deja de responder, verificá que su IP no haya cambiado (configurar IP fija en el router evita esto).',
      'En locales con mucho volumen, tener una impresora en cocina y otra en caja evita confusiones.',
    ],
  },
  {
    id: 'historial',
    icon: ClipboardList,
    label: 'Historial de Órdenes',
    color: 'text-slate-600',
    bgColor: 'bg-slate-500/10',
    plan: 'inicial',
    roles: ['admin', 'gerente', 'cajero'],
    objective: 'Consultar cualquier pedido pasado para resolver disputas, verificar entregas o hacer seguimiento de clientes.',
    description: 'El Historial contiene todos los pedidos procesados por tu restaurante, con filtros para encontrar rápidamente lo que buscás.',
    features: [
      { title: 'Búsqueda por número de orden', desc: 'Encontrá cualquier pedido específico ingresando su número de orden.' },
      { title: 'Filtros por fecha', desc: 'Filtrá por rango de fechas para ver los pedidos de un día, semana o mes específico.' },
      { title: 'Filtros por estado', desc: 'Filtrá por entregados, cancelados, pendientes, etc.' },
      { title: 'Filtros por sede', desc: 'Si tenés múltiples locales, filtrá por ubicación.' },
      { title: 'Detalle completo', desc: 'Cada orden muestra ítems, customizaciones, datos del cliente, total y timestamps de cada estado.' },
    ],
    tips: [
      'Usá el historial para confirmarle a un cliente que su pedido fue procesado y entregado.',
      'Los pedidos cancelados también aparecen en el historial — útil para detectar patrones de cancelación.',
    ],
  },
  {
    id: 'auditoria',
    icon: Shield,
    label: 'Auditoría',
    color: 'text-red-600',
    bgColor: 'bg-red-500/10',
    plan: 'premium',
    roles: ['admin'],
    objective: 'Tener trazabilidad completa de todas las acciones que realizó cada usuario del equipo en el panel.',
    description: 'El log de Auditoría registra automáticamente cada acción relevante en el panel: quién creó un pedido, quién canceló, quién modificó el menú, quién cambió configuraciones. Es fundamental para la transparencia y resolución de incidentes.',
    features: [
      { title: 'Registro automático', desc: 'Cada acción se registra sin necesidad de configuración. No podés desactivarlo.' },
      { title: 'Quién hizo qué', desc: 'Cada entrada muestra usuario, acción realizada, módulo afectado y timestamp exacto.' },
      { title: 'Filtros por usuario y acción', desc: 'Podés filtrar el log por usuario específico, tipo de acción o rango de fechas.' },
      { title: 'Exportable', desc: 'Podés exportar el log para auditorías externas o revisiones de cumplimiento.' },
    ],
    tips: [
      'Revisá el log de auditoría si notás cambios inesperados en el menú o configuración.',
      'Es tu herramienta principal para saber qué pasó y quién lo hizo en caso de un problema.',
      'Cada usuario solo puede ver sus propias acciones — solo el Admin ve el log completo.',
    ],
  },
  {
    id: 'configuracion',
    icon: Settings,
    label: 'Configuración',
    color: 'text-zinc-600',
    bgColor: 'bg-zinc-500/10',
    plan: 'todos',
    roles: ['admin'],
    objective: 'Personalizar tu restaurante en la plataforma: branding, sedes, horarios, integraciones de pago y preferencias de operación.',
    description: 'Configuración es el módulo donde definís cómo se ve y cómo funciona tu restaurante en TakeasyGO. Desde el logo y los colores hasta las credenciales de MercadoPago.',
    features: [
      { title: 'Branding', desc: 'Color primario, color de fondo, color de texto, logo, radio de bordes de los botones y layout del menú (lista o grilla).' },
      { title: 'Perfil del restaurante', desc: 'Nombre, descripción, historia, redes sociales para el footer del menú.' },
      { title: 'Sedes / Ubicaciones', desc: 'Podés tener múltiples locales (Crecimiento y Premium). Cada sede tiene su nombre, dirección, teléfono, horarios y QR propio.' },
      { title: 'Integración MercadoPago', desc: 'Configurá tus credenciales de MercadoPago (Access Token y Public Key) para recibir pagos.' },
      { title: 'Tiempo estimado de preparación', desc: 'Por sede: cuántos minutos tarda la preparación de un pedido promedio. Se usa para calcular el % de pedidos en tiempo (KPI Premium).' },
      { title: 'Modo Dine-in (Premium)', desc: 'Activar o desactivar el modo para consumo en mesa.' },
    ],
    steps: [
      { action: 'Configurá el branding primero', detail: 'El menú digital usa estos colores. Elegí colores que representen tu marca y que tengan buen contraste.' },
      { action: 'Completá el perfil del restaurante', detail: 'El about y las redes sociales aparecen en el footer del menú público.' },
      { action: 'Conectá MercadoPago', detail: 'Sin las credenciales, los clientes no pueden pagar. Obtené tu Access Token desde tu cuenta de MP.' },
      { action: 'Configurá el tiempo estimado de preparación', detail: 'Sé honesto: si normalmente tardás 20 minutos, poné 20. Esto afecta el KPI de pedidos en tiempo.' },
    ],
    tips: [
      'Usá colores con alto contraste entre primario y fondo. Un contraste bajo hace que el menú sea difícil de leer.',
      'El layout "grilla" funciona mejor para menús con fotos. El "lista" es mejor para menús extensos.',
      'Nunca compartás tu Access Token de MercadoPago. Tiene acceso a tu dinero.',
    ],
  },
  {
    id: 'facturacion',
    icon: CreditCard,
    label: 'Facturación',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-500/10',
    plan: 'todos',
    roles: ['admin'],
    objective: 'Gestionar tu suscripción a TakeasyGO: ver tu plan actual, cambiar de plan y gestionar el método de pago.',
    description: 'El módulo de Facturación te muestra tu plan actual, sus características, y te permite actualizar tu suscripción cuando querés acceder a más funcionalidades.',
    features: [
      { title: 'Plan actual', desc: 'Ves en qué plan estás, cuándo vence y qué incluye.' },
      { title: 'Comparativa de planes', desc: 'Vista lado a lado de todos los planes disponibles con sus features para facilitar la decisión de upgrade.' },
      { title: 'Cambio de plan', desc: 'Podés upgradearte directamente desde este módulo con pago por MercadoPago.' },
      { title: 'Historial de pagos', desc: 'Registro de tus pagos anteriores de suscripción.' },
    ],
    tips: [
      'Si estás en Trial y llegaste a los 30 pedidos, esta es la primera parada para elegir tu plan.',
      'Hacé el upgrade antes de que tu plan venza para no perder continuidad en el servicio.',
    ],
  },
]

// ── Plan badges ────────────────────────────────────────────────────────────────

const PLAN_CONFIG: Record<PlanBadge, { label: string; color: string }> = {
  todos:       { label: 'Todos los planes', color: 'bg-zinc-100 text-zinc-600' },
  inicial:     { label: 'Inicial +', color: 'bg-emerald-100 text-emerald-700' },
  crecimiento: { label: 'Crecimiento +', color: 'bg-blue-100 text-blue-700' },
  premium:     { label: 'Solo Premium', color: 'bg-amber-100 text-amber-700' },
}

const ROLE_CONFIG: Record<RoleBadge, { label: string; color: string }> = {
  admin:   { label: 'Admin', color: 'bg-red-50 text-red-600' },
  gerente: { label: 'Gerente', color: 'bg-purple-50 text-purple-600' },
  staff:   { label: 'Staff', color: 'bg-blue-50 text-blue-600' },
  cajero:  { label: 'Cajero', color: 'bg-zinc-50 text-zinc-600' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HelpCenter() {
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState('dashboard')
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({})
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const contentRef = useRef<HTMLDivElement>(null)

  // Filter sections by search
  const filtered = SECTIONS.filter(s =>
    !query ||
    s.label.toLowerCase().includes(query.toLowerCase()) ||
    s.description.toLowerCase().includes(query.toLowerCase()) ||
    s.features.some(f => f.title.toLowerCase().includes(query.toLowerCase()) || f.desc.toLowerCase().includes(query.toLowerCase()))
  )

  // Track active section on scroll
  useEffect(() => {
    const container = contentRef.current
    if (!container) return
    function onScroll() {
      const scrollTop = container!.scrollTop + 120
      for (const section of SECTIONS) {
        const el = sectionRefs.current[section.id]
        if (el && el.offsetTop <= scrollTop) setActiveId(section.id)
      }
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  function scrollTo(id: string) {
    const el = sectionRefs.current[id]
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' })
      setActiveId(id)
    }
    setQuery('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -m-6">

      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b bg-background px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
                <BookOpen size={22} className="text-primary" />
                Centro de Ayuda
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Guías y documentación de cada módulo del panel de administración.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-xl">
              <HelpCircle size={13} />
              {SECTIONS.length} módulos documentados
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar módulo, funcionalidad o acción..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 max-w-5xl mx-auto w-full">

        {/* Sidebar nav */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r py-6 px-3 gap-0.5 overflow-y-auto">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 px-2 mb-2">
            Módulos
          </p>
          {SECTIONS.map(s => {
            const Icon = s.icon
            const isActive = activeId === s.id
            return (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={cn(
                  'flex items-center gap-2.5 px-2 py-2 rounded-xl text-left text-sm transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon size={15} className={isActive ? 'text-primary' : ''} />
                <span className="truncate">{s.label}</span>
                {isActive && <ChevronRight size={12} className="ml-auto flex-shrink-0" />}
              </button>
            )
          })}
        </aside>

        {/* Content */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto py-8 px-6"
          style={{ scrollbarWidth: 'thin' }}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <Search size={32} className="text-muted-foreground/30" />
              <p className="font-bold text-muted-foreground">Sin resultados para "{query}"</p>
              <button onClick={() => setQuery('')} className="text-sm text-primary hover:underline">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="space-y-12 max-w-2xl">
              {filtered.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  sectionRef={el => { sectionRefs.current[section.id] = el }}
                  tipsExpanded={expandedTips[section.id] ?? false}
                  onToggleTips={() => setExpandedTips(p => ({ ...p, [section.id]: !p[section.id] }))}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Section Card ──────────────────────────────────────────────────────────────

function SectionCard({
  section,
  sectionRef,
  tipsExpanded,
  onToggleTips,
}: {
  section: Section
  sectionRef: (el: HTMLElement | null) => void
  tipsExpanded: boolean
  onToggleTips: () => void
}) {
  const Icon = section.icon
  const plan = PLAN_CONFIG[section.plan]

  return (
    <article
      ref={sectionRef}
      id={section.id}
      className="scroll-mt-6"
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', section.bgColor)}>
          <Icon size={20} className={section.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h2 className="text-xl font-black tracking-tight">{section.label}</h2>
            <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', plan.color)}>
              {plan.label}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {section.roles.map(role => (
              <span key={role} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', ROLE_CONFIG[role].color)}>
                {ROLE_CONFIG[role].label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Objetivo */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10 mb-5">
        <Target size={16} className="text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-0.5">Objetivo</p>
          <p className="text-sm font-medium text-foreground">{section.objective}</p>
        </div>
      </div>

      {/* Descripción */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-6">{section.description}</p>

      {/* Features */}
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">
          Funcionalidades
        </p>
        <div className="space-y-2">
          {section.features.map((f, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border bg-card hover:border-primary/20 transition-colors">
              <CheckCircle2 size={15} className="text-primary flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      {section.steps && section.steps.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">
            Cómo usarlo paso a paso
          </p>
          <div className="space-y-2">
            {section.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold">{step.action}</p>
                  {step.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {section.tips && section.tips.length > 0 && (
        <div>
          <button
            onClick={onToggleTips}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 mb-3 hover:text-amber-700 transition-colors"
          >
            <Star size={12} />
            Tips y mejores prácticas
            <ChevronRight
              size={12}
              className={cn('transition-transform', tipsExpanded ? 'rotate-90' : '')}
            />
          </button>
          {tipsExpanded && (
            <div className="space-y-2">
              {section.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-100">
                  <ArrowRight size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="mt-10 border-b border-dashed" />
    </article>
  )
}
