// Videos de muestra para medir memoria y cortes: 60 s, H.264 High, bitrate
// constante (10, 30 y 60 MB), 720p y 1080p, con contador visible y ruido para
// cargar el decodificador como un video real. Están en la cuenta ads de
// Cloudinary (carpeta ads/diagnostico), sin transformaciones: se bajan tal cual.

const BASE = (import.meta.env.VITE_DIAG_SAMPLES_BASE as string | undefined)
  || 'https://res.cloudinary.com/krnvdzuy/video/upload/ads/diagnostico'

export interface Sample { id: string; label: string; height: 720 | 1080; mb: number; url: string }

export const SAMPLES: Sample[] = ([720, 1080] as const).flatMap((height) =>
  [10, 30, 60].map((mb) => ({
    id: `s${height}-${mb}mb`,
    label: `${height}p · ${mb} MB`,
    height,
    mb,
    url: `${BASE}/s${height}-${mb}mb.mp4`,
  })),
)
