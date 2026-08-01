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
    home: 'Inicio',
    discover: 'Descubrí',
    map: 'Mapa',
    orders: 'Pedidos',
    profile: 'Perfil',
    back: 'Atrás',
    backToMenu: 'Volver al Menú',
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
      nearYouSub: 'Descubrimientos en tu zona',
      openNow: 'Abiertos ahora',
      categories: 'Cocinas',
      categoriesSub: 'Descubrí por tipo de comida',
      benefits: 'Beneficios',
      trending: 'Tendencia',
      now: 'Ahora mismo',
      newInNetwork: '✨ Recién llegaron a la red',
      newInNetworkSub: 'Nuevos en TGO esta semana',
      timeBased: '🌙 Para este momento',
      experiences: '🎁 Hoy podés aprovechar',
    },
    empty: {
      noResults: 'No encontramos lo que buscás',
      tryAnother: 'Probá con otro filtro',
      noNearby: 'No hay lugares cerca tuyo todavía',
      noOpen: 'Nada abierto ahora',
      amplifyZone: 'Querés ampliar la zona de búsqueda?',
      amplifyZoneAction: 'Ampliar zona',
      joinClub: 'Unite a un club',
      joinClubSub: 'Desbloqueá beneficios exclusivos con los comercios de tu zona',
      exploreClubs: 'Explorar clubes',
      exploreNow: 'Explorar ahora',
    },
    filters: 'Filtros',
    clearFilters: 'Limpiar',
    searchPlaceholder: '¿Qué buscás hoy?',
  },

  // ── Restaurant ──────────────────────────────────────────
  restaurant: {
    viewMenu: 'Ver menú',
    viewMenuAndOrder: 'Ver menú y pedir',
    viewCard: 'Ver carta',
    orderNow: 'Pedir ahora',
    reserve: 'Reservar',
    directions: 'Cómo llegar',
    call: 'Llamar',
    share: 'Compartir',
    favorite: 'Favorito',
    unfavorite: 'Quitar de favoritos',
    open: 'Abierto',
    closed: 'Cerrado',
    inNetwork: 'En Red TGO',
    directory: 'Directorio',
    readyIn: (min: number) => `Listo en ~${min} min`,
    opensAt: (time: string) => `Abre a las ${time}`,
    closesAt: (time: string) => `Cierra a las ${time}`,
    openUntil: (time: string) => `Abierto — Cierra a las ${time}`,
    openNow: 'Abierto ahora',
    closedUntil: (time: string) => `Cerrado — Abre ${time}`,
    closedNow: 'Cerrado ahora',
    deliveryTime: (min: number) => `${min} min`,
    priceLevel: (level: number) => '$'.repeat(level),
    distance: (km: number) => `${km} km`,
    noContact: 'Sin contacto disponible',
    isOwner: '¿Sos el dueño de este restaurante?',
    ownerPitch: 'Sumate a la red TGO y llegá a más clientes de tu zona.',
    ownerCta: 'Conocer planes →',
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
    gastronomicTitle: 'Tu perfil Gastronómico',
    loginRequired: 'Iniciá sesión para guardar tus favoritos, acceder a beneficios exclusivos y hacer seguimiento de tus pedidos.',
    activity: 'Actividad',
    historyAndTracking: 'Historial y seguimiento',
    manageAddresses: 'Gestionar direcciones de entrega',
    yourFavoritePlaces: 'Tus lugares preferidos',
    loadingClubs: 'Cargando...',
    yourClubs: 'Tus Clubs',
    viewAll: 'Ver todos',
    joinClub: 'Unite al Club',
    earnPoints: (name: string) => `Acumulá puntos en ${name}`,
    discoverClubs: 'Descubrí clubs',
    clubsNearby: (n: number) => `${n} clubs disponibles cerca tuyo`,
    noClubsAvailable: 'Sin clubs disponibles por ahora',
    settings: 'Configuración',
    myAccount: 'Mi Cuenta',
    preferencesAndData: 'Preferencias y datos',
    addresses: 'Direcciones',
    favorites: 'Favoritos',
    clubs: 'Clubes',
    orders: 'Pedidos',
    redemptions: 'Canjes',
    signOut: 'Cerrar Sesión',
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
    sendFailed: 'Error al enviar el link. Intentá de nuevo.',
  },

  // ── Settings ────────────────────────────────────────────
  settings: {
    title: 'Configuración',
    subtitle: 'Preferencias de tu cuenta',
    notifications: 'Notificaciones',
    pushNotifications: 'Notificaciones Push',
    pushDescription: 'Recibí alertas cuando tu pedido esté listo',
    information: 'Información',
    terms: 'Términos y Condiciones',
    termsSub: 'Uso de la plataforma',
    privacy: 'Aviso de Privacidad',
    privacySub: 'Protección de datos personales',
    generalInfo: 'Información General',
    about: 'TGO es la red de takeaway de TakeasyGO. Encontrá los mejores lugares para comer cerca de tu zona.',
  },

  // ── Promotions ──────────────────────────────────────────
  promotions: {
    title: 'Ofertas',
    subtitle: 'Todas las promociones disponibles',
    empty: 'Sin ofertas por ahora',
    emptySub: 'No hay promociones disponibles en tu zona',
  },

  // ── Auth ────────────────────────────────────────────────
  auth: {
    termsPrefix: 'Al continuar, aceptás nuestros ',
    termsLink: 'Términos y condiciones',
  },

  // ── Confirmations ───────────────────────────────────────
  confirm: {
    deleteAddress: '¿Eliminar esta dirección?',
    cancelOrder: '¿Cancelar este pedido?',
    logout: '¿Querés salir?',
  },

  // ── Store / Redemptions ─────────────────────────────────
  store: {
    title: 'Tienda',
    unavailable: 'Tienda no disponible',
    unavailableSub: 'La tienda de recompensas no está habilitada para este comercio.',
    noItems: 'No hay artículos disponibles',
    noItemsSub: 'Probá con otra categoría o volvé más tarde.',
    redeem: 'Canjear',
    processing: 'Procesando...',
    pointsInsufficient: 'Puntos insuficientes',
    tierInsufficient: 'Nivel insuficiente',
    outOfStock: 'Sin stock',
    recurrentRequired: 'Requiere compras recurrentes',
    myRedemptions: 'Mis Canjes',
    noRedemptions: 'No tenés canjes aún',
    redemptionAvailable: 'Recompensa disponible',
    redemptionAvailableSub: 'Ya podés canjear tu recompensa',
  },

  // ── B2B ─────────────────────────────────────────────────
  b2b: {
    ownerCta: 'Soy dueño →',
    register: 'Registrar mi local',
    askOwner: '¿Tenés un restaurante?',
    pitch: 'Sumate a la plataforma y llegá a más clientes de tu zona.',
  },

  // ── Loading ─────────────────────────────────────────────
  loading: {
    default: 'Cargando...',
    gps: 'Preparando tu experiencia...',
    detecting: 'Detectando ubicación',
    wait: 'Esto toma solo un momento',
    searching: 'Buscando',
    localizing: 'Localizando...',
    mapPosition: 'Localizando posición en el mapa...',
  },

  // ── Notifications ───────────────────────────────────────
  notifications: {
    activate: 'Activar',
  },

  // ── PWA ─────────────────────────────────────────────────
  pwa: {
    installTitle: 'Instalá TGO',
    install: 'Instalar',
    installed: 'Ya tenés TGO instalado',
  },

  // ── Toasts ──────────────────────────────────────────────
  toasts: {
    linkCopied: 'Link copiado',
    codeCopied: 'Código copiado',
    messageCopied: 'Mensaje copiado para compartir',
    shareTitle: (title: string) => `Canje: ${title}`,
  },
} as const

export type MicrocopyKey = typeof microcopy
