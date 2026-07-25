/**
 * Microcopy Registry — TakeasyGO
 *
 * Centraliza TODOS los textos de interfaz del consumidor.
 * Patrón: un solo lugar para editar, traducir, o ajustar tono.
 *
 * Convenciones:
 * - Tuteo rioplatense (vos, tenés, podés)
 * - Imperativos suaves (Explorá, Descubrí, Elegí)
 * - Nada de "click aquí" — siempre verbos de acción
 * - Mensajes de error = accionables, no genéricos
 */

export const microcopy = {
  // ── Navigation ──────────────────────────────────────────
  nav: {
    discover: 'Descubrí',
    map: 'Mapa',
    orders: 'Pedidos',
    profile: 'Perfil',
    back: 'Atrás',
    close: 'Cerrar',
    next: 'Siguiente',
    skip: 'Saltar',
    finish: 'Vamos',
  },

  // ── Onboarding ──────────────────────────────────────────
  onboarding: {
    welcome: {
      title: 'Bienvenido.',
      subtitle: 'Vamos.',
    },
    greeting: {
      title: (name: string) => `Hola, ${name}`,
      subtitle: '¿Cómo te llamás?',
    },
    name: {
      title: '¿Cómo te llamás?',
      placeholder: 'Tu nombre',
    },
    zone: {
      title: '¿En qué zona te movés?',
      subtitle: 'Así te mostramos lo que tenés cerca.',
      useLocation: 'Usar mi ubicación actual',
      divider: 'o elegí tu barrio',
      privacy: 'Tu ubicación nunca se comparte.',
    },
    cuisine: {
      title: '¿Qué te gusta comer?',
      counter: (n: number, max: number) => `${n}/${max}`,
      maxReached: `Elegí hasta 5`,
    },
    experience: {
      title: '¿Qué experiencias disfrutás más?',
      subtitle: 'No preguntamos solo comida.',
    },
    auth: {
      title: 'Continuá.',
      subtitle: 'Creá tu cuenta para guardar favoritos y acceder a beneficios.',
      google: 'Continuar con Google',
      apple: 'Próximamente Apple',
      email: 'Continuar con Email',
      emailInput: 'Ingresá tu email',
      emailHint: 'Te enviamos un link mágico para entrar sin contraseña.',
      send: 'Enviar link',
      sent: 'Revisá tu email.',
      sentBody: 'Te enviamos un link mágico para entrar sin contraseña.',
      sentInstructions: 'Abrí el email en tu celular y hacé clic en el link.',
      tryAnother: 'Usar otro email',
    },
    manifest: {
      skip: 'Saltar',
    },
  },

  // ── Discovery Feed ──────────────────────────────────────
  discovery: {
    quickFilters: {
      open: 'Abiertos',
      delivery: 'Delivery',
      nearby: 'Cerca',
      benefits: 'Beneficios',
      all: 'Todos',
    },
    sections: {
      nearYou: 'Cerca de vos',
      openNow: 'Abiertos ahora',
      categories: 'Cocinas',
      benefits: 'Beneficios',
      trending: 'Tendencia',
    },
    empty: {
      noResults: 'No encontramos lo que buscás',
      tryAnother: 'Probá con otro filtro',
      noNearby: 'No hay lugares cerca tuyo todavía',
      noOpen: 'Nada abierto ahora',
    },
  },

  // ── Restaurant ──────────────────────────────────────────
  restaurant: {
    viewMenu: 'Ver menú',
    orderNow: 'Pedir ahora',
    reserve: 'Reservar',
    directions: 'Cómo llegar',
    call: 'Llamar',
    share: 'Compartir',
    favorite: 'Favorito',
    unfavorite: 'Quitar de favoritos',
    open: 'Abierto',
    closed: 'Cerrado',
    opensAt: (time: string) => `Abre a las ${time}`,
    closesAt: (time: string) => `Cierra a las ${time}`,
    deliveryTime: (min: number) => `${min} min`,
    priceLevel: (level: number) => '$'.repeat(level),
    distance: (km: number) => `${km} km`,
  },

  // ── Orders ──────────────────────────────────────────────
  orders: {
    title: 'Tus pedidos',
    empty: 'No tenés pedidos todavía',
    status: {
      pending: 'Pendiente',
      confirmed: 'Confirmado',
      preparing: 'Preparando',
      ready: 'Listo',
      delivering: 'En camino',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
    },
    takeTrack: 'Seguí tu pedido',
    reorder: 'Volver a pedir',
    rate: 'Calificar',
  },

  // ── Profile ─────────────────────────────────────────────
  profile: {
    title: 'Tu perfil',
    settings: 'Configuración',
    addresses: 'Direcciones',
    favorites: 'Favoritos',
    clubs: 'Clubes',
    orders: 'Pedidos',
    redemptions: 'Canjes',
    logout: 'Salir',
    version: 'Versión',
  },

  // ── Errors ──────────────────────────────────────────────
  errors: {
    generic: 'Algo salió mal',
    retry: 'Reintentar',
    network: 'Revisá tu conexión',
    notFound: 'No encontramos lo que buscás',
    addressRequired: 'Completá la dirección',
    emailInvalid: 'Ingresá un email válido',
    locationDenied: 'Permiso de ubicación denegado',
    locationUnsupported: 'Geolocalización no disponible',
    locationError: 'No pudimos obtener tu ubicación',
  },

  // ── Confirmations ───────────────────────────────────────
  confirm: {
    deleteAddress: '¿Eliminar esta dirección?',
    cancelOrder: '¿Cancelar este pedido?',
    logout: '¿Querés salir?',
  },
} as const

export type MicrocopyKey = typeof microcopy
