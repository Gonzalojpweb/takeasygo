import type { ServiceSlot } from '@/app/api/explore/nearby/route'

/**
 * Unified type for RestaurantCard across Home, Explore, Search, and Map views.
 *
 * This is the superset of NearbyRestaurant (nearby endpoint) and
 * HomeNearbyTenant (home endpoint). Both endpoints must adapt their
 * response to satisfy this type before passing to RestaurantCard.
 *
 * Fields marked with ? are optional — RestaurantCard must handle
 * their absence gracefully (fallback to neutral/hidden state).
 */
export interface RestaurantCardData {
  id: string
  type: 'network' | 'listed'
  name: string
  slug?: string
  tenantSlug?: string
  address: string
  lat: number | null
  lng: number | null
  distanceM: number | null
  phone: string
  cuisineTypes: string[]
  heroImage: string
  logoUrl?: string
  primaryColor?: string
  isOpenNow: boolean | null
  isDeliveryOpen?: boolean | null
  deliveryEnabled?: boolean
  isOperational: boolean
  acceptsOrders: boolean
  estimatedPickupTime: number
  orderModes: string[]
  averageRating?: number | null
  ratingCount?: number
  capacityScore?: number | null
  isNew?: boolean
  createdAt?: string | null
  // Detail page fields (optional, only populated by nearby endpoint)
  serviceHours?: { takeaway: ServiceSlot[]; delivery?: ServiceSlot[] }
  openingHours?: string
  externalMenuUrl?: string
  // Directory enrichment fields
  description?: string
  heroImageUrl?: string
  gallery?: string[]
  website?: string
  instagram?: string
  facebook?: string
  loyaltyInfo?: {
    hasClub: boolean
    clubName?: string | null
    hasActivePromo: boolean
    promoTypes?: string[]
  }
  // Living City System (LCS) fields
  icoScore?: number | null
  icoRing?: 'none' | 'thin' | 'marked' | 'gold'
  hasCrown?: boolean
  hasWinkOffer?: boolean
}
