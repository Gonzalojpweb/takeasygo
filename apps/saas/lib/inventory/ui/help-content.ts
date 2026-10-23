// ============================================================================
// Centro de ayuda de Inventario — contenido, búsqueda y recomendaciones
// ============================================================================
// Puro (sin React ni Mongo): lo usa el panel «Ver ayuda» y lo prueban los
// tests. Escrito para quien trabaja en la cocina o administra el local, sin
// tecnicismos: qué es, cómo se hace, qué conviene y qué hay que saber.
//
// Dinámico en tres sentidos:
//   1. Abre en el tema de la pantalla donde estás (HELP_BY_VIEW).
//   2. «Para tu sede» arma recomendaciones con los números reales de la
//      sede (recommendationsFor).
//   3. Búsqueda que ignora acentos y mayúsculas, por título, resumen,
//      palabras clave y texto (searchHelp).
// Si cambia una regla del inventario, se cambia acá también.
// ============================================================================

export type HelpTopicId =
  | 'empezar'
  | 'como-funciona'
  | 'tablero'
  | 'recibir'
  | 'conteo'
  | 'merma'
  | 'productos'
  | 'estimacion'
  | 'stock-minimo'
  | 'recetas'
  | 'variantes'
  | 'opciones'
  | 'preparaciones'
  | 'costos'
  | 'actividad'
  | 'ajustes-sede'
  | 'ajuste-transferencia'
  | 'roles'
  | 'buenas-practicas'
  | 'faq'

export type HelpGroup = 'Primeros pasos' | 'Día a día' | 'Recetas' | 'Entender los números' | 'Ajustes' | 'Consejos y dudas'

export interface HelpSection {
  heading?: string
  paragraphs?: string[]
  steps?: string[]
  tips?: string[]
  warnings?: string[]
  /** Preguntas y respuestas (para «Preguntas frecuentes»). */
  qa?: Array<{ q: string; a: string }>
}

export interface HelpTopic {
  id: HelpTopicId
  group: HelpGroup
  title: string
  summary: string
  keywords: string[]
  sections: HelpSection[]
  related?: HelpTopicId[]
}

export const HELP_GROUPS: HelpGroup[] = ['Primeros pasos', 'Día a día', 'Recetas', 'Entender los números', 'Ajustes', 'Consejos y dudas']

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'empezar',
    group: 'Primeros pasos',
    title: 'Poner en marcha el inventario',
    summary: 'Tres pasos: preparar la sede, cargar recetas y contar una vez. Después, las ventas descuentan solas.',
    keywords: ['empezar', 'activar', 'puesta en marcha', 'preparar', 'inicio', 'configurar'],
    sections: [
      {
        steps: [
          'Preparar la sede: se crea el depósito de la cocina. Mientras está «en preparación», las ventas no descuentan nada, así que podés armar todo sin apuro.',
          'Cargar las recetas de los platos que más se venden. Cada receta dice qué insumos lleva una porción.',
          'Contar una vez los insumos de esas recetas. Ese primer conteo es el punto de partida.',
          'Activar: desde ese momento, cada venta descuenta sola lo que lleva el plato.',
        ],
      },
      {
        heading: 'No hace falta tener todo listo',
        paragraphs: [
          'Podés activar con los platos más vendidos y sumar el resto de a poco. Un plato sin receta se vende igual: solo que su venta no descuenta insumos.',
        ],
        tips: ['Empezá por los 10 platos que más salen: suelen ser la mayor parte de lo que se consume.'],
      },
    ],
    related: ['como-funciona', 'recetas', 'conteo'],
  },
  {
    id: 'como-funciona',
    group: 'Primeros pasos',
    title: 'Cómo funciona el control automático',
    summary: 'Cada venta descuenta los insumos de su receta. Las compras suman, los conteos corrigen y las mermas restan.',
    keywords: ['automatico', 'descuento', 'ventas', 'como funciona', 'stock', 'teorico'],
    sections: [
      {
        paragraphs: [
          'El inventario es una cuenta que se mueve sola: lo que entra (mercadería), lo que sale (ventas y mermas) y lo que se verifica (conteos).',
          'Cuando un pedido se confirma (entra a la cocina), el sistema mira la receta del plato y descuenta esos insumos del depósito de la cocina. Si después se cancela, los devuelve.',
        ],
      },
      {
        heading: 'Qué mueve el stock',
        tips: [
          'Registrar mercadería: suma lo que llegó.',
          'Ventas: restan solas, según la receta de cada plato.',
          'Merma: resta lo que se tiró, se venció o se rompió.',
          'Conteo: no suma ni resta, corrige. Le dice al sistema cuánto hay de verdad.',
          'Producción: usa insumos y genera un elaborado (salsas, masas, caldos).',
        ],
      },
      {
        heading: 'Por qué es una estimación',
        paragraphs: [
          'Entre conteo y conteo, el sistema calcula cuánto debería haber. Como en una cocina siempre hay diferencias (porciones un poco más grandes, algo que se cae), muestra la cantidad con un margen. Cada conteo achica ese margen.',
        ],
      },
    ],
    related: ['estimacion', 'recetas', 'conteo'],
  },
  {
    id: 'tablero',
    group: 'Día a día',
    title: 'El tablero «Ahora»',
    summary: 'Lo primero que hay que mirar cada día: el estado general, los números clave y las tareas recomendadas.',
    keywords: ['ahora', 'tablero', 'inicio', 'tareas', 'atencion', 'resumen'],
    sections: [
      {
        heading: 'Los indicadores',
        tips: [
          'Insumos: cuántos sigue el sistema en esta sede.',
          'Recetas activas: cuántos platos ya descuentan solos, sobre el total del menú.',
          'Requieren atención: cosas para resolver hoy (faltantes, conteos, recetas).',
          'Valor del stock: cuánto vale lo que hay, según el costo promedio de compra.',
        ],
      },
      {
        heading: 'Atención hoy',
        paragraphs: [
          'Son tareas ordenadas por importancia, cada una con un solo botón para resolverla. «Urgente» es algo que puede faltar o un número que no cierra; «Sugerencia» es algo que mejora la precisión.',
        ],
        tips: ['Cuando no queda nada pendiente, ves «Todo en orden». Ese es el objetivo de cada día.'],
      },
    ],
    related: ['buenas-practicas', 'productos'],
  },
  {
    id: 'recibir',
    group: 'Día a día',
    title: 'Registrar mercadería',
    summary: 'Cargá lo que llegó como figura en el remito, en tres pasos: productos, cantidades y confirmar.',
    keywords: ['mercaderia', 'recibir', 'compra', 'proveedor', 'remito', 'factura', 'entrada'],
    sections: [
      {
        steps: [
          'Productos: elegí lo que llegó. Arriba están los que más se usan; si no está, buscalo o crealo.',
          'Cantidades: escribí cuánto llegó de cada uno. Si viene en caja o bolsa, marcá «viene en presentación» y poné cuánto trae cada una.',
          'Confirmar: revisá y registrá. Cada producto se registra por separado: si uno falla, los demás quedan.',
        ],
      },
      {
        heading: 'El precio, opcional pero valioso',
        paragraphs: ['Si cargás el total pagado por línea, el sistema calcula el costo por unidad y con eso el costo de cada plato y el valor del stock.'],
      },
      {
        warnings: ['Registrá la mercadería el mismo día que llega. Si no, el sistema cree que hay menos y te pide reponer algo que ya tenés.'],
      },
    ],
    related: ['costos', 'productos'],
  },
  {
    id: 'conteo',
    group: 'Día a día',
    title: 'Hacer un conteo',
    summary: 'Contar le dice al sistema cuánto hay de verdad. No hace falta contar todo: el sistema te pide lo que importa.',
    keywords: ['conteo', 'contar', 'inventario fisico', 'verificar', 'balanza', 'corregir'],
    sections: [
      {
        steps: [
          'Abrí el insumo (o la tarea «Contar») y escribí cuánto hay.',
          'Indicá cómo lo mediste: con balanza es más preciso que a ojo, y el sistema lo tiene en cuenta.',
          'Registrá. El stock se corrige al instante y el margen de la estimación se achica.',
        ],
      },
      {
        heading: 'Cuándo contar',
        tips: [
          'Siempre que el sistema lo pida en «Atención hoy».',
          'Cuando un número no te cierra.',
          'Los insumos más caros o más usados, una vez por semana.',
        ],
      },
      {
        paragraphs: ['Un conteo nunca borra la historia: queda registrado con tu nombre y la diferencia con lo que el sistema esperaba.'],
      },
    ],
    related: ['estimacion', 'buenas-practicas'],
  },
  {
    id: 'merma',
    group: 'Día a día',
    title: 'Registrar una merma',
    summary: 'Lo que se tira, se vence o se rompe. Registrarlo explica las diferencias y te muestra dónde se pierde plata.',
    keywords: ['merma', 'desperdicio', 'vencido', 'tirar', 'rotura', 'perdida'],
    sections: [
      {
        steps: ['Abrí el insumo y tocá «Merma».', 'Escribí cuánto y elegí el motivo (vencido, se rompió, quedó mal…).', 'Registrá: se descuenta del stock y queda en la actividad.'],
      },
      {
        tips: ['Si no registrás las mermas, el sistema cree que hay más de lo que hay y los conteos van a mostrar faltantes.'],
      },
    ],
    related: ['actividad', 'costos'],
  },
  {
    id: 'productos',
    group: 'Día a día',
    title: 'Productos e insumos',
    summary: 'La lista de todo lo que sigue el sistema, con cuánto hay, cuánto dura y qué necesita atención.',
    keywords: ['productos', 'insumos', 'lista', 'stock', 'ficha', 'existencias'],
    sections: [
      {
        heading: 'Los estados',
        tips: [
          'Disponible: hay y la estimación es confiable.',
          'Por acabarse: está por debajo del stock mínimo.',
          'Sin stock: probablemente no queda.',
          'Conviene contar: hace tiempo que no se verifica y el margen creció.',
          'Revisar: se vendió más de lo registrado (falta una compra o la receta lleva más de lo cargado).',
          'Sin conteo inicial: todavía no se contó nunca, así que el sistema no sabe cuánto hay.',
        ],
      },
      {
        heading: 'La ficha de cada insumo',
        paragraphs: ['Tocando un insumo ves el stock actual, cuánto se usa por día, para cuántos días alcanza, su historia (cada entrada y salida) y en qué recetas se usa.'],
      },
    ],
    related: ['estimacion', 'stock-minimo'],
  },
  {
    id: 'estimacion',
    group: 'Entender los números',
    title: 'Por qué el stock es una estimación',
    summary: 'El número que ves es lo que debería haber según ventas, compras y mermas. El margen dice qué tan seguro es.',
    keywords: ['estimacion', 'margen', 'confianza', 'diferencia', 'no coincide', 'precision', 'teorico'],
    sections: [
      {
        paragraphs: [
          'Ningún sistema ve la cocina: calcula. Por eso mostramos «unos 4,5 kg» con un margen, en vez de un número exacto que no lo es.',
          'Con cada venta el margen crece un poco (las porciones nunca son idénticas). Con cada conteo, vuelve a achicarse.',
        ],
      },
      {
        heading: 'Qué hacer si no coincide',
        steps: [
          'Fijate si falta registrar una compra o una merma.',
          'Revisá la receta: quizá la porción real lleva más o menos de lo cargado.',
          'Contá el insumo: el sistema se corrige solo y aprende el consumo real.',
        ],
      },
    ],
    related: ['conteo', 'recetas'],
  },
  {
    id: 'stock-minimo',
    group: 'Ajustes',
    title: 'Stock mínimo y avisos',
    summary: 'Por debajo del stock mínimo, el insumo pasa a «Por acabarse» y aparece en «Atención hoy».',
    keywords: ['stock minimo', 'reponer', 'aviso', 'alerta', 'faltante', 'par', 'pedido'],
    sections: [
      {
        steps: ['Abrí el insumo → «Configurar insumo».', 'En «Stock mínimo», escribí la cantidad por debajo de la cual querés reponer.', 'Guardá. Desde ahí te avisamos a tiempo.'],
      },
      {
        tips: [
          'Una regla simple: lo que usás en los días que tarda el proveedor en traerlo, más un día de margen.',
          'En la ficha ves «uso diario» y «alcanza para»: usalos para elegir el número.',
          'La «importancia» del insumo hace que el sistema pida contar antes lo crítico.',
        ],
      },
    ],
    related: ['productos', 'recibir'],
  },
  {
    id: 'recetas',
    group: 'Recetas',
    title: 'Cargar una receta',
    summary: 'Una receta dice qué insumos lleva UNA porción del plato. Con eso, cada venta descuenta sola.',
    keywords: ['receta', 'plato', 'ingredientes', 'porcion', 'cargar', 'editar', 'escandallo'],
    sections: [
      {
        steps: [
          'En «Recetas», tocá el plato (primero los más vendidos).',
          'Agregá cada insumo con la cantidad de UNA porción (ej.: 150 g de carne). Si el insumo no existe, lo creás ahí mismo.',
          'Si el sistema ofrece «Sugerir insumos», usalo como punto de partida y ajustá a tu porción.',
          'Guardá: el sistema te muestra qué se va a descontar por porción antes de confirmar.',
        ],
      },
      {
        heading: 'Cambiar una receta',
        paragraphs: ['Podés editarla cuando quieras. Las ventas anteriores conservan la receta con la que se vendieron: el cambio vale desde ese momento.'],
      },
      {
        warnings: ['Cargá cantidades por porción, no por tanda. Si una olla rinde 10 porciones, dividí.'],
      },
    ],
    related: ['variantes', 'preparaciones', 'costos'],
  },
  {
    id: 'variantes',
    group: 'Recetas',
    title: 'Variantes (simple, doble, grande…)',
    summary: 'Cada variante necesita su propia receta, o confirmar que consume igual que la base. Si no, sus ventas no descuentan.',
    keywords: ['variante', 'doble', 'grande', 'tamaño', 'base', 'confirmar'],
    sections: [
      {
        paragraphs: [
          'Si el plato tiene variantes en el menú (ej.: hamburguesa simple y doble), el sistema no adivina: una doble lleva más carne.',
          'Para cada variante elegís: «tiene su propia receta» o «igual que la base» (cuando solo cambia el nombre o el precio).',
        ],
      },
      {
        warnings: ['Una variante «sin confirmar» se vende igual, pero no descuenta insumos. La ves marcada en Recetas.'],
      },
    ],
    related: ['recetas'],
  },
  {
    id: 'opciones',
    group: 'Recetas',
    title: 'Opciones del menú (extra queso, sin cebolla)',
    summary: 'Las opciones que cambian lo que lleva un plato se configuran una vez y valen para todos los platos donde aparecen.',
    keywords: ['opciones', 'extra', 'sin', 'agregado', 'personalizacion', 'modificador'],
    sections: [
      {
        paragraphs: ['«Extra queso» suma queso; «Sin cebolla» la resta. Se aplica por porción, en cada plato donde el cliente la elija.'],
        steps: ['Recetas → «Opciones del menú».', 'Tocá la opción y cargá qué insumo cambia y cuánto (positivo suma, negativo resta).'],
      },
    ],
    related: ['recetas'],
  },
  {
    id: 'preparaciones',
    group: 'Recetas',
    title: 'Preparaciones (salsas, masas, caldos)',
    summary: 'Lo que se elabora en la cocina: una tanda usa insumos y rinde un elaborado que después usan los platos.',
    keywords: ['preparacion', 'elaborado', 'salsa', 'masa', 'caldo', 'produccion', 'tanda'],
    sections: [
      {
        steps: [
          'Recetas → «Preparaciones» → «Nueva preparación»: qué insumos lleva una tanda y cuánto rinde.',
          'Cuando la cocinan, tocá «Producir»: se descuentan los insumos y se suma el elaborado.',
          'En las recetas de los platos, usá el elaborado como un insumo más (ej.: 80 g de salsa).',
        ],
      },
      {
        tips: ['Si pesás lo que rindió de verdad, cargalo: el sistema usa lo real en vez de lo teórico.'],
      },
    ],
    related: ['recetas', 'costos'],
  },
  {
    id: 'costos',
    group: 'Entender los números',
    title: 'Costos, costo por plato y valor del stock',
    summary: 'El costo sale de lo que pagaste al registrar mercadería. Con eso se calcula el costo de cada plato y el valor de lo que hay.',
    keywords: ['costo', 'precio', 'food cost', 'margen', 'valor', 'plata', 'rentabilidad'],
    sections: [
      {
        tips: [
          'Costo del insumo: el promedio de lo que pagaste en las últimas compras.',
          'Costo por porción: la suma de lo que lleva la receta, a ese costo.',
          '% del precio: cuánto del precio de venta se va en insumos. En gastronomía se suele buscar entre 25 % y 35 %.',
          'Valor del stock: lo que hay, multiplicado por su costo.',
        ],
      },
      {
        warnings: ['Si a un insumo nunca le cargaste precio, el costo del plato sale incompleto (te lo avisamos).'],
      },
    ],
    related: ['recibir', 'recetas'],
  },
  {
    id: 'actividad',
    group: 'Entender los números',
    title: 'Actividad: qué pasó y quién',
    summary: 'Cada entrada, salida, conteo y ajuste queda registrado con fecha, persona y motivo. Nada se borra.',
    keywords: ['actividad', 'historial', 'movimientos', 'quien', 'auditoria', 'registro'],
    sections: [
      {
        paragraphs: ['Si un número llama la atención, la actividad responde «¿por qué el sistema cree esto?». Podés filtrar por tipo de movimiento.'],
        tips: ['Un error no se borra: se corrige con un conteo o un ajuste, y ambos quedan a la vista.'],
      },
    ],
    related: ['ajuste-transferencia', 'estimacion'],
  },
  {
    id: 'ajustes-sede',
    group: 'Ajustes',
    title: 'Configuración de la sede y depósitos',
    summary: 'Depósitos (cocina, cámara, barra), revisar ventas recientes y recalcular. Solo gestión.',
    keywords: ['sede', 'deposito', 'camara', 'barra', 'configuracion', 'recalcular', 'revisar ventas'],
    sections: [
      {
        tips: [
          'Depósito de consumo: de ahí descuentan las ventas. Sumá otros para separar la cámara, la barra o el depósito.',
          '«Revisar ventas de las últimas 36 horas»: descuenta lo que haya faltado. Es seguro repetirlo, nunca duplica.',
          '«Recalcular el stock»: rehace las estimaciones desde el historial, sin tocar ningún movimiento.',
        ],
      },
      {
        warnings: ['Encender o apagar el descuento automático de una sede lo hace un administrador o el gerente de operaciones.'],
      },
    ],
    related: ['empezar', 'ajuste-transferencia'],
  },
  {
    id: 'ajuste-transferencia',
    group: 'Ajustes',
    title: 'Ajustes y transferencias',
    summary: 'Ajustar corrige con un motivo (ej.: devolución al proveedor). Transferir mueve mercadería entre sedes.',
    keywords: ['ajuste', 'transferencia', 'mover', 'otra sede', 'devolucion', 'corregir'],
    sections: [
      {
        tips: [
          'Ajuste: para lo que no es venta, compra, merma ni conteo. Siempre con motivo; queda con tu nombre.',
          'Transferencia: sale de una sede y entra en la otra en el mismo movimiento.',
          'Para corregir cuánto hay, preferí un conteo: es más claro que un ajuste.',
        ],
      },
    ],
    related: ['actividad', 'conteo'],
  },
  {
    id: 'roles',
    group: 'Ajustes',
    title: 'Quién puede hacer qué',
    summary: 'El inventario lo llevan la cocina y la gestión. Caja, mozos y staff no lo ven.',
    keywords: ['roles', 'permisos', 'quien', 'jefe de cocina', 'cajero', 'manager', 'acceso'],
    sections: [
      {
        tips: [
          'Jefe de cocina: registra mercadería, cuenta, carga mermas y arma recetas.',
          'Administrador, manager y gerente de operaciones: todo lo anterior, más costos, ajustes, transferencias y configuración de la sede.',
          'Cajero, mozo y staff: no tienen acceso al inventario.',
        ],
      },
    ],
    related: ['ajustes-sede'],
  },
  {
    id: 'buenas-practicas',
    group: 'Consejos y dudas',
    title: 'Rutina recomendada',
    summary: 'Diez minutos por día alcanzan para un inventario confiable.',
    keywords: ['rutina', 'recomendaciones', 'consejos', 'buenas practicas', 'diario', 'semanal'],
    sections: [
      {
        heading: 'Cada día',
        tips: ['Mirá «Atención hoy» y resolvé lo urgente.', 'Registrá la mercadería cuando llega, con el remito en la mano.', 'Anotá las mermas en el momento.'],
      },
      {
        heading: 'Cada semana',
        tips: ['Contá los 5 insumos más caros o más usados.', 'Revisá en Recetas si quedó algún plato o variante pendiente.', 'Mirá el % de costo de los platos más vendidos.'],
      },
      {
        heading: 'Cuando cambia el menú',
        tips: ['Si agregás o renombrás un plato, cargá su receta. Las recetas de platos que ya no están aparecen aparte para que las limpies.'],
      },
    ],
    related: ['tablero', 'conteo'],
  },
  {
    id: 'faq',
    group: 'Consejos y dudas',
    title: 'Preguntas frecuentes',
    summary: 'Las dudas más comunes, con respuesta corta.',
    keywords: ['preguntas', 'dudas', 'faq', 'ayuda', 'problema'],
    sections: [
      {
        qa: [
          { q: '¿Qué pasa si se cancela un pedido?', a: 'Los insumos que había descontado vuelven solos al stock.' },
          { q: '¿Un plato sin receta se puede vender?', a: 'Sí, se vende normal. Solo que no descuenta insumos hasta que cargues su receta.' },
          { q: 'Cambié una receta, ¿se recalcula lo ya vendido?', a: 'No. Cada venta conserva la receta con la que se vendió. El cambio vale desde ahora.' },
          { q: 'El stock dice que no hay, pero tengo. ¿Qué hago?', a: 'Contalo. Seguramente falta registrar una compra. El conteo lo corrige al instante.' },
          { q: '¿Por qué dice «se vendió más de lo registrado»?', a: 'Las ventas descontaron más de lo que entró. Falta registrar una compra o la receta lleva menos de lo real. Contá el insumo para corregir.' },
          { q: '¿Tengo que contar todo seguido?', a: 'No. El sistema te pide contar solo lo que importa: lo que está por acabarse, lo crítico y lo que hace tiempo no se verifica.' },
          { q: '¿Puedo usar la pantalla anterior?', a: 'Sí, abajo de todo está el link a la pantalla clásica mientras dure la transición.' },
          { q: '¿Las ventas del local (POS) también descuentan?', a: 'Sí: cualquier pedido confirmado de un plato con receta descuenta, venga del menú online, del QR de la mesa o del POS.' },
          { q: '¿En qué momento se descuenta?', a: 'Cuando el pedido se confirma y entra a la cocina, no cuando se cobra. Si se cancela, vuelve.' },
        ],
      },
    ],
    related: ['estimacion', 'como-funciona'],
  },
]

const TOPIC_BY_ID = new Map(HELP_TOPICS.map((t) => [t.id, t]))

export function helpTopic(id: HelpTopicId): HelpTopic {
  return TOPIC_BY_ID.get(id) ?? HELP_TOPICS[0]
}

/** Tema con el que abre la ayuda según la pantalla. */
export const HELP_BY_VIEW: Record<'ahora' | 'productos' | 'recetas' | 'actividad', HelpTopicId> = {
  ahora: 'tablero',
  productos: 'productos',
  recetas: 'recetas',
  actividad: 'actividad',
}

export function normalizeHelpText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function topicText(t: HelpTopic): string {
  const parts = [t.title, t.summary, ...t.keywords]
  for (const s of t.sections) {
    parts.push(s.heading ?? '', ...(s.paragraphs ?? []), ...(s.steps ?? []), ...(s.tips ?? []), ...(s.warnings ?? []))
    for (const qa of s.qa ?? []) parts.push(qa.q, qa.a)
  }
  return normalizeHelpText(parts.join(' '))
}

/** Búsqueda sin acentos: primero los que coinciden en título o palabras clave. */
export function searchHelp(query: string): HelpTopic[] {
  const words = normalizeHelpText(query).split(/\s+/).filter((w) => w.length >= 2)
  if (words.length === 0) return []
  const scored = HELP_TOPICS.map((t) => {
    const head = normalizeHelpText([t.title, ...t.keywords].join(' '))
    const all = topicText(t)
    if (!words.every((w) => all.includes(w))) return { t, score: 0 }
    const score = words.reduce((s, w) => s + (head.includes(w) ? 3 : 1), 0)
    return { t, score }
  })
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.t)
}

// ── Recomendaciones para la sede (con los números reales) ──────────────────

export interface HelpState {
  locationName: string
  status: 'off' | 'preparing' | 'active'
  coverage: { total: number; ready: number; noRecipe: number; variantsPending: number }
  totalSkus: number
  neverCounted: number
  urgentTasks: number
  importantTasks: number
  orphans: number
  pendingSalesPortions: number
  canRecipes: boolean
  canCapture: boolean
  canManage: boolean
}

export interface Recommendation {
  id: string
  tone: 'urgent' | 'tip' | 'ok'
  title: string
  body: string
  topic: HelpTopicId
}

export function recommendationsFor(s: HelpState): Recommendation[] {
  const out: Recommendation[] = []
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

  if (s.status === 'off') {
    out.push({
      id: 'setup',
      tone: 'tip',
      title: `${s.locationName} todavía no tiene inventario`,
      body: s.canManage
        ? 'Empezá por «Preparar la sede»: mientras está en preparación, las ventas no descuentan nada y podés armar todo sin apuro.'
        : 'La preparación la inicia un administrador, manager o el gerente de operaciones. Mientras tanto podés ir cargando recetas.',
      topic: 'empezar',
    })
    return out
  }

  if (s.status === 'preparing') {
    out.push({
      id: 'preparing',
      tone: 'tip',
      title: 'La sede está en preparación',
      body:
        s.coverage.ready > 0
          ? `Ya hay ${s.coverage.ready} ${plural(s.coverage.ready, 'plato listo', 'platos listos')}. Cuando cuentes sus insumos, ${s.canManage ? 'activá' : 'pedí que activen'} el inventario para que las ventas descuenten.`
          : 'Cargá la receta de los platos que más se venden. Con una sola receta ya se puede activar.',
      topic: 'empezar',
    })
  }

  if (s.urgentTasks > 0) {
    out.push({
      id: 'urgent',
      tone: 'urgent',
      title: `${s.urgentTasks} ${plural(s.urgentTasks, 'tema urgente', 'temas urgentes')} para hoy`,
      body: 'Son insumos que pueden faltar o números que no cierran. Están arriba en «Atención hoy», cada uno con su botón.',
      topic: 'tablero',
    })
  }

  const pending = s.coverage.noRecipe + s.coverage.variantsPending
  if (pending > 0 && s.coverage.total > 0) {
    const pct = Math.round((s.coverage.ready / s.coverage.total) * 100)
    out.push({
      id: 'recipes',
      tone: pct < 60 ? 'urgent' : 'tip',
      title: `${pending} ${plural(pending, 'plato', 'platos')} todavía no ${plural(pending, 'descuenta', 'descuentan')}`,
      body: `Hoy el ${pct} % del menú descuenta solo. ${s.canRecipes ? 'Cargá primero los más vendidos: en Recetas están ordenados por ventas.' : 'Las recetas las carga la cocina o la gestión.'}${s.coverage.variantsPending > 0 ? ` ${s.coverage.variantsPending} ${plural(s.coverage.variantsPending, 'tiene variantes', 'tienen variantes')} sin confirmar.` : ''}`,
      topic: s.coverage.variantsPending > 0 && s.coverage.noRecipe === 0 ? 'variantes' : 'recetas',
    })
  }

  if (s.pendingSalesPortions > 0) {
    out.push({
      id: 'pending-sales',
      tone: 'tip',
      title: `${s.pendingSalesPortions} ${plural(s.pendingSalesPortions, 'porción vendida', 'porciones vendidas')} esta semana sin descontar`,
      body: 'Son ventas de platos o variantes sin receta. No se pierden: desde que cargues la receta, las próximas descuentan.',
      topic: 'variantes',
    })
  }

  if (s.neverCounted > 0) {
    out.push({
      id: 'first-counts',
      tone: s.neverCounted > 5 ? 'urgent' : 'tip',
      title: `${s.neverCounted} ${plural(s.neverCounted, 'insumo sin', 'insumos sin')} conteo inicial`,
      body: 'Sin un primer conteo el sistema no sabe cuánto hay. Contalos una vez; después los sigue solo.',
      topic: 'conteo',
    })
  }

  if (s.orphans > 0) {
    out.push({
      id: 'orphans',
      tone: 'tip',
      title: `${s.orphans} ${plural(s.orphans, 'receta de un plato', 'recetas de platos')} que ya no ${plural(s.orphans, 'está', 'están')} en el menú`,
      body: 'No descuentan nada. Si renombraste el plato, cargá la receta en el nuevo y quitá la vieja.',
      topic: 'buenas-practicas',
    })
  }

  if (s.status === 'active' && out.length === 0) {
    out.push({
      id: 'all-good',
      tone: 'ok',
      title: 'Todo en orden en ' + s.locationName,
      body: 'Las ventas descuentan solas y no hay pendientes. Mantené la rutina: mercadería el día que llega, mermas en el momento y unos conteos por semana.',
      topic: 'buenas-practicas',
    })
  } else if (s.status === 'active' && s.importantTasks > 0 && s.urgentTasks === 0) {
    out.push({
      id: 'important',
      tone: 'tip',
      title: `${s.importantTasks} ${plural(s.importantTasks, 'tarea importante', 'tareas importantes')}`,
      body: 'No son urgentes, pero resolverlas hoy mantiene el inventario preciso.',
      topic: 'tablero',
    })
  }
  return out
}
