'use client'

import { useEffect, useRef } from 'react'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import 'leaflet/dist/leaflet.css'

interface Props {
  userLat: number
  userLng: number
  restaurants: NearbyRestaurant[]
  onSelect: (r: NearbyRestaurant) => void
}

export default function ExploreMap({ userLat, userLng, restaurants, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    // Leaflet solo corre en el browser — import dinámico dentro del efecto
    import('leaflet').then(L => {
      // StrictMode monta dos veces — si el cleanup ya corrió, no inicializar
      if (cancelled || !containerRef.current || mapRef.current) return
      // Si el contenedor aún tiene _leaflet_id residual, limpiarlo antes de inicializar
      if ((containerRef.current as any)._leaflet_id) {
        delete (containerRef.current as any)._leaflet_id
      }

      const map = L.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: true,
      }).setView([userLat, userLng], 15)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // ── Marcador del usuario ──────────────────────────────────────────────
      const userIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:16px;height:16px;border-radius:50%;
          background:#3b82f6;border:3px solid white;
          box-shadow:0 0 0 3px rgba(59,130,246,0.4);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>Tu ubicación</b>')

      // ── Marcadores de restaurantes ────────────────────────────────────────
      restaurants.forEach(r => {
        const isNetwork = r.type === 'network'
        const color = isNetwork ? '#10b981' : '#71717a'
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${color};border:2px solid white;
            box-shadow:0 2px 4px rgba(0,0,0,0.3);
            cursor:pointer;
          "></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          popupAnchor: [0, -10],
        })

        const distText = r.distanceM < 1000
          ? `${r.distanceM}m`
          : `${(r.distanceM / 1000).toFixed(1)}km`

        const badgeColor = isNetwork ? '#10b981' : '#71717a'
        const badgeLabel = isNetwork ? 'En Red' : 'Directorio'

        L.marker([r.lat, r.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family:system-ui;min-width:160px">
              <span style="
                font-size:10px;font-weight:700;text-transform:uppercase;
                color:${badgeColor};letter-spacing:0.05em;
              ">${badgeLabel}</span>
              <p style="font-weight:600;margin:2px 0 4px;font-size:14px">${r.name}</p>
              <p style="color:#71717a;font-size:12px;margin:0 0 6px">${distText} · ${r.address}</p>
              ${isNetwork
                ? `<a href="/${r.tenantSlug}/menu/${r.id}/takeaway"
                     target="_blank"
                     style="display:block;text-align:center;background:#10b981;color:white;
                            border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;
                            text-decoration:none">
                     Ver menú →
                   </a>`
                : r.phone
                  ? `<a href="tel:${r.phone}"
                       style="display:block;text-align:center;background:#3f3f46;color:white;
                              border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;
                              text-decoration:none">
                       Llamar para pedir
                     </a>`
                  : ''
              }
            </div>
          `, { maxWidth: 220 })
          .on('click', () => onSelect(r))
      })

      mapRef.current = map
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      // Limpiar _leaflet_id del contenedor para que Leaflet pueda reinicializarlo
      if (containerRef.current) {
        delete (containerRef.current as any)._leaflet_id
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Actualizar marcadores cuando cambian los restaurantes (sin reinicializar el mapa)
  useEffect(() => {
    if (!mapRef.current) return
    // El mapa ya tiene los marcadores del mount inicial.
    // En futuras versiones se puede sincronizar dinámicamente.
    // Por ahora, el efecto de mount ya tiene los datos del primer fetch.
  }, [restaurants])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: '100%' }}
    />
  )
}
