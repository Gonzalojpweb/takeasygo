/**
 * Plantillas por rubro para el alta rápida: categorías de arranque, horarios
 * típicos, color sugerido y tipo de cocina. Las categorías nacen vacías y el
 * menú público no muestra categorías sin productos, así que nunca se ve una
 * carta "de ejemplo" con datos inventados.
 */

export interface ServiceSlotTemplate { days: number[]; open: string; close: string }

export interface RubroTemplate {
  id: string
  label: string
  cuisineTypes: string[]
  primaryColor: string
  /** «Horarios de Atención» (texto que se muestra en el menú). */
  hoursText: string
  serviceHours: { takeaway: ServiceSlotTemplate[]; dineIn: ServiceSlotTemplate[]; delivery: ServiceSlotTemplate[] }
  categories: string[]
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const TUE_SUN = [0, 2, 3, 4, 5, 6]
const MON_SAT = [1, 2, 3, 4, 5, 6]
const all = (slots: ServiceSlotTemplate[]) => ({ takeaway: slots, dineIn: slots, delivery: slots })

export const RUBRO_TEMPLATES: readonly RubroTemplate[] = [
  {
    id: 'cafeteria', label: 'Cafetería', cuisineTypes: ['Cafetería'], primaryColor: '#7C4A2D',
    hoursText: 'Lun a sáb · 8 a 20 h', serviceHours: all([{ days: MON_SAT, open: '08:00', close: '20:00' }]),
    categories: ['Cafés', 'Bebidas frías', 'Desayunos y meriendas', 'Pastelería', 'Sándwiches y tostados'],
  },
  {
    id: 'panaderia', label: 'Panadería y pastelería', cuisineTypes: ['Panadería'], primaryColor: '#B7791F',
    hoursText: 'Lun a dom · 7 a 21 h', serviceHours: all([{ days: EVERY_DAY, open: '07:00', close: '21:00' }]),
    categories: ['Panes', 'Facturas', 'Tortas', 'Masas y tartas', 'Salados'],
  },
  {
    id: 'parrilla', label: 'Parrilla', cuisineTypes: ['Parrilla'], primaryColor: '#9B2C2C',
    hoursText: 'Mar a dom · 12 a 16 y 20 a 0 h',
    serviceHours: all([{ days: TUE_SUN, open: '12:00', close: '16:00' }, { days: TUE_SUN, open: '20:00', close: '00:00' }]),
    categories: ['Entradas', 'Achuras', 'Cortes', 'Guarniciones', 'Ensaladas', 'Postres', 'Bebidas'],
  },
  {
    id: 'pizzeria', label: 'Pizzería', cuisineTypes: ['Pizzería'], primaryColor: '#C53030',
    hoursText: 'Mar a dom · 19:30 a 0 h', serviceHours: all([{ days: TUE_SUN, open: '19:30', close: '00:00' }]),
    categories: ['Pizzas', 'Pizzas especiales', 'Empanadas', 'Fainá y extras', 'Postres', 'Bebidas'],
  },
  {
    id: 'hamburgueseria', label: 'Hamburguesería', cuisineTypes: ['Hamburguesas'], primaryColor: '#DD6B20',
    hoursText: 'Lun a dom · 12 a 0 h', serviceHours: all([{ days: EVERY_DAY, open: '12:00', close: '00:00' }]),
    categories: ['Hamburguesas', 'Combos', 'Papas y acompañamientos', 'Veggies', 'Postres', 'Bebidas'],
  },
  {
    id: 'empanadas', label: 'Empanadas', cuisineTypes: ['Empanadas'], primaryColor: '#B7791F',
    hoursText: 'Lun a dom · 11 a 15 y 19 a 23 h',
    serviceHours: all([{ days: EVERY_DAY, open: '11:00', close: '15:00' }, { days: EVERY_DAY, open: '19:00', close: '23:00' }]),
    categories: ['Empanadas clásicas', 'Empanadas especiales', 'Docenas y promos', 'Postres', 'Bebidas'],
  },
  {
    id: 'pastas', label: 'Pastas', cuisineTypes: ['Pastas', 'Italiana'], primaryColor: '#2F855A',
    hoursText: 'Mar a dom · 12 a 15:30 y 20 a 23:30 h',
    serviceHours: all([{ days: TUE_SUN, open: '12:00', close: '15:30' }, { days: TUE_SUN, open: '20:00', close: '23:30' }]),
    categories: ['Entradas', 'Pastas', 'Salsas', 'Platos principales', 'Postres', 'Bebidas'],
  },
  {
    id: 'sushi', label: 'Sushi y japonesa', cuisineTypes: ['Sushi', 'Japonesa'], primaryColor: '#1A202C',
    hoursText: 'Mar a dom · 19 a 0 h', serviceHours: all([{ days: TUE_SUN, open: '19:00', close: '00:00' }]),
    categories: ['Rolls', 'Combinados', 'Nigiris y sashimi', 'Entradas calientes', 'Postres', 'Bebidas'],
  },
  {
    id: 'mexicana', label: 'Mexicana', cuisineTypes: ['Mexicana'], primaryColor: '#C05621',
    hoursText: 'Mar a dom · 12 a 0 h', serviceHours: all([{ days: TUE_SUN, open: '12:00', close: '00:00' }]),
    categories: ['Tacos', 'Burritos y quesadillas', 'Nachos y para compartir', 'Postres', 'Bebidas'],
  },
  {
    id: 'saludable', label: 'Saludable y vegana', cuisineTypes: ['Saludable', 'Vegana'], primaryColor: '#38A169',
    hoursText: 'Lun a sáb · 9 a 21 h', serviceHours: all([{ days: MON_SAT, open: '09:00', close: '21:00' }]),
    categories: ['Bowls', 'Ensaladas', 'Wraps y sándwiches', 'Jugos y licuados', 'Postres'],
  },
  {
    id: 'heladeria', label: 'Heladería', cuisineTypes: ['Heladería'], primaryColor: '#D53F8C',
    hoursText: 'Lun a dom · 12 a 1 h', serviceHours: all([{ days: EVERY_DAY, open: '12:00', close: '01:00' }]),
    categories: ['Helado por peso', 'Cucuruchos y vasitos', 'Postres helados', 'Cafetería'],
  },
  {
    id: 'bar', label: 'Bar y cervecería', cuisineTypes: ['Bar', 'Cervecería'], primaryColor: '#975A16',
    hoursText: 'Mar a dom · 18 a 2 h', serviceHours: all([{ days: TUE_SUN, open: '18:00', close: '02:00' }]),
    categories: ['Cervezas', 'Tragos', 'Vinos', 'Sin alcohol', 'Para picar', 'Platos'],
  },
  {
    id: 'rotiseria', label: 'Rotisería y comida para llevar', cuisineTypes: ['Rotisería'], primaryColor: '#B83280',
    hoursText: 'Lun a sáb · 11 a 15 y 19 a 22 h',
    serviceHours: all([{ days: MON_SAT, open: '11:00', close: '15:00' }, { days: MON_SAT, open: '19:00', close: '22:00' }]),
    categories: ['Platos del día', 'Pollos', 'Guarniciones', 'Tartas y empanadas', 'Postres', 'Bebidas'],
  },
  {
    id: 'restaurante', label: 'Restaurante (general)', cuisineTypes: ['Restaurante'], primaryColor: '#2C5282',
    hoursText: 'Mar a dom · 12 a 16 y 20 a 0 h',
    serviceHours: all([{ days: TUE_SUN, open: '12:00', close: '16:00' }, { days: TUE_SUN, open: '20:00', close: '00:00' }]),
    categories: ['Entradas', 'Principales', 'Guarniciones', 'Postres', 'Bebidas'],
  },
] as const

export function getRubroTemplate(id: string | null | undefined): RubroTemplate {
  return RUBRO_TEMPLATES.find(t => t.id === id) ?? RUBRO_TEMPLATES[RUBRO_TEMPLATES.length - 1]
}

/** Categorías vacías del rubro, listas para Menu.categories. */
export function templateCategories(t: RubroTemplate): Array<Record<string, unknown>> {
  return t.categories.map((name, i) => ({ name, description: '', isAvailable: true, sortOrder: i, items: [] }))
}
