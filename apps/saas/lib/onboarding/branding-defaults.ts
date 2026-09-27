export type CuisineType = 'cafeteria' | 'hamburguesas' | 'parrilla' | 'pizza' | 'casual'

interface BrandingDefault {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  fontFamily: string
}

export const brandingDefaults: Record<string, BrandingDefault> = {
  'cafeteria': {
    primaryColor: '#c28e67', // Café
    secondaryColor: '#f5ebe1',
    backgroundColor: '#ffffff',
    textColor: '#2c221a',
    fontFamily: 'Playfair Display',
  },
  'hamburguesas': {
    primaryColor: '#e03a3c', // Rojo ketchup
    secondaryColor: '#f7c033', // Amarillo mostaza
    backgroundColor: '#ffffff',
    textColor: '#1a1a1a',
    fontFamily: 'Inter',
  },
  'parrilla': {
    primaryColor: '#8a2821', // Rojo carne
    secondaryColor: '#362f2d', // Carbón
    backgroundColor: '#ffffff',
    textColor: '#1a1a1a',
    fontFamily: 'Inter',
  },
  'pizza': {
    primaryColor: '#1d803c', // Verde orégano / Italia
    secondaryColor: '#d64038', // Rojo tomate
    backgroundColor: '#ffffff',
    textColor: '#1a1a1a',
    fontFamily: 'Inter',
  },
  'casual': {
    primaryColor: '#2b5c8f', // Azul trust
    secondaryColor: '#e8f0f8',
    backgroundColor: '#ffffff',
    textColor: '#1a1a1a',
    fontFamily: 'Inter',
  },
}

export function getBrandingForCuisine(type: string): BrandingDefault {
  // Normalize: lowercase + strip accents (handles "Cafetería" → "cafeteria")
  const normalized = type
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalized.includes('cafe')) return brandingDefaults['cafeteria']
  if (normalized.includes('hamburguesa')) return brandingDefaults['hamburguesas']
  if (normalized.includes('parrilla')) return brandingDefaults['parrilla']
  if (normalized.includes('pizza')) return brandingDefaults['pizza']
  return brandingDefaults['casual']
}
