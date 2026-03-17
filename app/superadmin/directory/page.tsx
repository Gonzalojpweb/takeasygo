import { connectDB } from '@/lib/mongoose'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import DirectoryManager from '@/components/superadmin/DirectoryManager'
import type { DirectoryEntry } from '@/components/superadmin/DirectoryManager'

export default async function DirectoryPage() {
  await connectDB()

  const raw = await RestaurantDirectory.find().sort({ createdAt: -1 }).lean<
    Array<{
      _id: any
      name: string
      address: string
      geo?: { type: string; coordinates: [number, number] }
      phone: string
      cuisineTypes: string[]
      openingHours: string
      takeawayConfirmed: boolean
      externalMenuUrl: string
      status: 'listed' | 'claimed' | 'converted'
      notes: string
    }>
  >()

  const entries: DirectoryEntry[] = raw.map(e => ({
    _id: e._id.toString(),
    name: e.name,
    address: e.address,
    lat: e.geo?.coordinates ? e.geo.coordinates[1] : null,
    lng: e.geo?.coordinates ? e.geo.coordinates[0] : null,
    phone: e.phone ?? '',
    cuisineTypes: e.cuisineTypes ?? [],
    openingHours: e.openingHours ?? '',
    takeawayConfirmed: e.takeawayConfirmed ?? true,
    externalMenuUrl: e.externalMenuUrl ?? '',
    status: e.status ?? 'listed',
    notes: e.notes ?? '',
  }))

  const stats = {
    listed:    entries.filter(e => e.status === 'listed').length,
    claimed:   entries.filter(e => e.status === 'claimed').length,
    converted: entries.filter(e => e.status === 'converted').length,
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Directorio</h1>
        <p className="text-muted-foreground mt-1 font-medium">
          Restaurantes fuera de red — listados en el mapa público para consumidores.
        </p>
      </div>

      <DirectoryManager initialEntries={entries} initialStats={stats} />
    </div>
  )
}
