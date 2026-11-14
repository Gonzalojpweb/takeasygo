// ============================================================================
// Guía en vivo — contenido de cada etapa del recorrido
// ============================================================================
// Escrito para el dueño o el encargado de cocina, no para un contador:
// frases cortas, ejemplos de cocina y cero palabras técnicas («insumo» sí,
// porque así se le dice en la cocina; «SKU», «ledger» o «canónica» nunca).
// Cada etapa: qué es, por qué importa, cómo se hace, un tip de cocina y los
// errores más comunes con su arreglo (sacados de las pruebas reales).
// ============================================================================

import type { StageId } from './rules'
import type { HelpTopicId } from '../ui/help-content'

export interface StageContent {
  id: StageId
  number: number
  title: string
  /** Una línea: qué se logra en esta etapa. */
  goal: string
  /** Ícono (nombre de lucide). */
  icon: 'chef' | 'book' | 'clipboard' | 'power' | 'calendar'
  /** Cuánto lleva, para que el dueño lo pueda planificar. */
  time: string
  why: string
  steps: string[]
  chefTip: string
  mistakes: Array<{ mistake: string; fix: string }>
  /** Tema del centro de ayuda para leer más. */
  helpTopic: HelpTopicId
}

export const STAGE_CONTENT: Record<StageId, StageContent> = {
  prepare: {
    id: 'prepare',
    number: 1,
    title: 'Preparar la cocina',
    goal: 'Abrir el inventario de esta sede sin que nada cambie todavía.',
    icon: 'chef',
    time: '1 minuto',
    why: 'Mientras la sede está «en preparación», las ventas NO descuentan nada. Es tu espacio de prueba: cargás recetas y contás tranquilo, sin miedo a romper nada.',
    steps: [
      'Tocá «Empezar la preparación».',
      'Listo: se crea la «Cocina», el lugar desde donde se descuenta lo que se vende.',
      'Si tenés cámara, depósito o barra aparte, los podés sumar después en «Configuración de la sede».',
    ],
    chefTip: 'Hacelo un día tranquilo, a la mañana antes del servicio. No hace falta cerrar el local.',
    mistakes: [
      { mistake: 'Activar el mismo día que empezás, sin recetas ni conteo.', fix: 'Quedate en preparación hasta tener las recetas de los platos que más salen y el primer conteo hecho.' },
    ],
    helpTopic: 'empezar',
  },
  recipes: {
    id: 'recipes',
    number: 2,
    title: 'Recetas de tus platos estrella',
    goal: 'Decirle al sistema qué lleva UN plato, tal como sale al salón.',
    icon: 'book',
    time: '3 a 5 minutos por plato',
    why: 'Con la receta, cada venta descuenta sola lo que usa. Sin receta el plato se vende igual, pero no baja el stock.',
    steps: [
      'Empezá por los 5 platos que más vendés: con eso ya cubrís la mayor parte de lo que sale.',
      'Abrí el plato y buscá cada ingrediente. Si no existe, lo creás ahí mismo.',
      'Poné la cantidad de UNA porción: «180 g de merluza», «12 mejillones», «30 ml de aceite».',
      'Lo chiquito que no vale la pena seguir (sal, pimienta, perejil) podés dejarlo afuera.',
      'Guardá. Si el plato tiene tamaños o variantes, la app te pregunta por cada una.',
    ],
    chefTip: 'Pesá una porción real con la balanza la primera vez. La receta «de memoria» casi siempre se queda corta.',
    mistakes: [
      { mistake: 'Cargar la receta de la olla o la bandeja entera (2 kg de salsa) en vez de la de un plato.', fix: 'Dividí lo que usás en la tanda por los platos que salen. Si una olla de 2 kg da 10 platos, son 200 g por plato.' },
      { mistake: 'Confundir la unidad: poner «200» en kilos queriendo decir gramos.', fix: 'Mirá la unidad al lado de la cantidad antes de guardar. La guía te avisa si un número parece raro.' },
      { mistake: 'Poner en la receta lo que comprás (una caja de 20) en vez de lo que lleva el plato.', fix: 'La caja va en «Registrar mercadería». En la receta va solo lo que lleva una porción.' },
      { mistake: 'Crear dos veces el mismo ingrediente con otro nombre («Mejillón» y «Mejillones»).', fix: 'Antes de crear, buscalo: si ya existe, usá ese. Todas las recetas comparten el mismo ingrediente.' },
    ],
    helpTopic: 'recetas',
  },
  count: {
    id: 'count',
    number: 3,
    title: 'El primer conteo',
    goal: 'Anotar cuánto hay HOY de cada ingrediente de tus recetas.',
    icon: 'clipboard',
    time: '10 a 20 minutos',
    why: 'Es el punto de partida. Desde ahí el sistema suma las compras y resta las ventas solo. Sin primer conteo arranca de cero, y a la primera venta queda en negativo.',
    steps: [
      'La guía te muestra solo los ingredientes de las recetas que cargaste: no hace falta contar todo el local.',
      'Contá lo que hay en la cocina y en la cámara. Pesá lo suelto y contá lo que viene por unidad.',
      'Anotalo en la unidad que te resulte cómoda (kg o g, litros o ml): la app convierte sola.',
      'Si algo está abierto o por la mitad, poné lo que hay de verdad, aunque sea a ojo.',
    ],
    chefTip: 'Contá antes del servicio o después del cierre, nunca en plena hora pico: si se vende mientras contás, el número no cierra.',
    mistakes: [
      { mistake: 'Activar y vender antes de contar.', fix: 'Si ya pasó, contá ahora: el conteo reemplaza el número y desde ahí todo sigue bien.' },
      { mistake: 'Registrar como compra lo que ya estaba en la cámara.', fix: 'Lo que ya tenés se CUENTA. Como compra va solo lo que llega nuevo del proveedor.' },
    ],
    helpTopic: 'conteo',
  },
  activate: {
    id: 'activate',
    number: 4,
    title: 'Activar el descuento automático',
    goal: 'Que cada venta descuente sola los ingredientes.',
    icon: 'power',
    time: '1 minuto',
    why: 'Desde que activás, cada plato con receta que se vende (salón, mostrador, delivery) descuenta lo que lleva. Si un ingrediente no alcanza para un plato entero, el plato se pausa solo en la carta, para no vender lo que no podés servir.',
    steps: [
      'Antes de activar, mirá los avisos de la guía: si dice que una receta pide más de lo que tenés, corregilo primero.',
      'Tocá «Activar inventario» y confirmá.',
      'Hacé una venta de prueba y fijate en «Actividad» que haya descontado bien.',
    ],
    chefTip: 'Activá un día de semana, no un sábado a la noche. Así, si algo no cierra, lo ajustás con calma.',
    mistakes: [
      { mistake: 'Una receta pide más de lo que hay (20 por plato y tenés 12): el plato aparece «Sin inventario».', fix: 'Revisá si la receta es de una porción. Si está bien, registrá la compra que llegó y el plato vuelve solo.' },
      { mistake: 'Pensar que «Sin inventario» es una falla.', fix: 'Es el sistema cuidándote: no alcanza para un plato entero. La guía te dice qué ingrediente falta y cuánto.' },
    ],
    helpTopic: 'como-funciona',
  },
  daily: {
    id: 'daily',
    number: 5,
    title: 'El día a día',
    goal: 'Tres hábitos cortos que mantienen el número real.',
    icon: 'calendar',
    time: '5 minutos por día',
    why: 'El sistema descuenta las ventas solo. Lo que necesita de vos es saber qué entra (compras) y qué se pierde (mermas). Con eso, el stock que ves es el que hay.',
    steps: [
      'Compras: registrá la mercadería el día que llega. Con la factura a mano, cargá el total y el precio se calcula solo.',
      'Mermas: lo que se vence, se quema, se cae o come el personal, anotalo en el momento.',
      'Conteos: la app te pide contar solo lo que importa ese día (lo caro o lo que se mueve mucho). Uno o dos por día alcanzan.',
    ],
    chefTip: 'Dejá el celular o la tablet cerca de donde recibís al proveedor: registrar la compra en el momento lleva 30 segundos.',
    mistakes: [
      { mistake: 'Tocar dos veces «Registrar» porque la pantalla tardó.', fix: 'Esperá el cartel verde. Si ya pasó, la guía te avisa y lo corregís con un conteo.' },
      { mistake: 'No anotar las mermas «porque es poco».', fix: 'Poco todos los días es mucho a fin de mes, y descuadra el stock. Anotalas aunque sea a ojo.' },
      { mistake: 'Ver una diferencia en el conteo y no buscar la causa.', fix: 'Casi siempre es una compra sin registrar, una merma sin anotar o una receta corta. La guía te sugiere cuál.' },
    ],
    helpTopic: 'buenas-practicas',
  },
}

export const STAGE_ORDER: StageId[] = ['prepare', 'recipes', 'count', 'activate', 'daily']
