// ============================================================================
// Display Studio — herramientas de imagen en el navegador (plan §8, sin costo)
// ============================================================================
// · hasTransparency: ¿la foto ya viene recortada? (lee el canal alfa)
// · removeFlatBackground: «Quitar fondo gratis» para fotos de producto sobre
//   fondo liso o casi liso (lo más común: mesa blanca, pared, papel). Relleno
//   desde los bordes con tolerancia adaptativa + borde suavizado + recorte al
//   producto. Corre en el dispositivo: la foto no sale hasta que se guarda.
//   Si el fondo es muy variado, avisa y propone subir un PNG recortado (o el
//   «Quitar fondo HD» cuando esté activo).
// · uploadStudioImage: sube un archivo/blob por el flujo firmado (superficie
//   'studio') y devuelve la URL verificada.
// ============================================================================

const MAX_SIDE = 1600

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = src
  })
}

function toCanvas(img: HTMLImageElement, maxSide = MAX_SIDE): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * s))
  c.height = Math.max(1, Math.round(img.naturalHeight * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return { c, ctx }
}

/** true si la foto tiene transparencia real en los bordes (≥ 5 % de los píxeles del borde). */
export function hasTransparency(img: HTMLImageElement): boolean {
  const { c, ctx } = toCanvas(img, 400)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let edge = 0
  let clear = 0
  const check = (x: number, y: number) => { edge++; if (d[(y * c.width + x) * 4 + 3] < 200) clear++ }
  for (let x = 0; x < c.width; x++) { check(x, 0); check(x, c.height - 1) }
  for (let y = 1; y < c.height - 1; y++) { check(0, y); check(c.width - 1, y) }
  return edge > 0 && clear / edge >= 0.05
}

export interface RemoveResult { ok: true; blob: Blob; preview: string }
export interface RemoveFail { ok: false; reason: string }

/** Quita un fondo liso o casi liso. Nunca lanza: devuelve el motivo si no puede. */
export async function removeFlatBackground(img: HTMLImageElement): Promise<RemoveResult | RemoveFail> {
  const { c, ctx } = toCanvas(img)
  const W = c.width
  const H = c.height
  const id = ctx.getImageData(0, 0, W, H)
  const d = id.data

  // 1. Color de fondo: mediana de los píxeles del borde; qué tan parejo es.
  const border: number[][] = []
  const step = Math.max(1, Math.floor((W + H) / 600))
  for (let x = 0; x < W; x += step) { border.push(px(d, W, x, 0), px(d, W, x, H - 1)) }
  for (let y = 0; y < H; y += step) { border.push(px(d, W, 0, y), px(d, W, W - 1, y)) }
  const med = [0, 1, 2].map((k) => median(border.map((p) => p[k])))
  const dists = border.map((p) => dist(p, med))
  const spread = median(dists)
  const near = dists.filter((x) => x < 40).length / dists.length
  if (near < 0.7 || spread > 30) {
    return { ok: false, reason: 'El fondo de esta foto no es liso (tiene objetos, sombras fuertes o texturas). Probá con una foto sobre fondo liso o subí un PNG ya recortado.' }
  }
  const tol = Math.min(70, Math.max(26, spread * 3 + 22))

  // 2. Relleno desde los bordes (BFS) con tolerancia respecto del color de fondo.
  const bg = new Uint8Array(W * H)
  const queue = new Int32Array(W * H)
  let qh = 0
  let qt = 0
  const push = (i: number) => { if (!bg[i] && distAt(d, i, med) <= tol) { bg[i] = 1; queue[qt++] = i } }
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1) }
  while (qh < qt) {
    const i = queue[qh++]
    const x = i % W
    if (x > 0) push(i - 1)
    if (x < W - 1) push(i + 1)
    if (i >= W) push(i - W)
    if (i < W * (H - 1)) push(i + W)
  }
  const bgShare = qt / (W * H)
  if (bgShare < 0.08) return { ok: false, reason: 'No encontramos un fondo para quitar: el producto ocupa toda la foto.' }
  if (bgShare > 0.97) return { ok: false, reason: 'No encontramos el producto: la foto parece ser solo fondo.' }

  // 3. Alfa: fondo transparente; borde suavizado según la distancia de color.
  let minX = W, minY = H, maxX = -1, maxY = -1
  for (let i = 0; i < W * H; i++) {
    if (bg[i]) { d[i * 4 + 3] = 0; continue }
    const x = i % W
    const y = (i - x) / W
    const touches = (x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (i >= W && bg[i - W]) || (i < W * (H - 1) && bg[i + W])
    if (touches) {
      const k = Math.min(1, Math.max(0.15, (distAt(d, i, med) - tol * 0.5) / (tol * 1.2)))
      d[i * 4 + 3] = Math.round(d[i * 4 + 3] * k)
    }
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  ctx.putImageData(id, 0, 0)

  // 4. Recorte al producto con un margen chico.
  const pad = Math.round(Math.max(W, H) * 0.02)
  const cx = Math.max(0, minX - pad)
  const cy = Math.max(0, minY - pad)
  const cw = Math.min(W, maxX + pad + 1) - cx
  const ch = Math.min(H, maxY + pad + 1) - cy
  const out = document.createElement('canvas')
  // Mínimo de la superficie: 400 px de lado corto (se agranda si hace falta, sin deformar).
  const up = Math.max(1, 400 / Math.min(cw, ch))
  out.width = Math.round(cw * up)
  out.height = Math.round(ch * up)
  const octx = out.getContext('2d')!
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(c, cx, cy, cw, ch, 0, 0, out.width, out.height)
  const blob: Blob | null = await new Promise((r) => out.toBlob(r, 'image/png'))
  if (!blob) return { ok: false, reason: 'No se pudo generar la imagen.' }
  return { ok: true, blob, preview: URL.createObjectURL(blob) }
}

function px(d: Uint8ClampedArray, W: number, x: number, y: number): number[] {
  const i = (y * W + x) * 4
  return [d[i], d[i + 1], d[i + 2]]
}
function distAt(d: Uint8ClampedArray, i: number, c: number[]): number {
  const r = d[i * 4] - c[0], g = d[i * 4 + 1] - c[1], b = d[i * 4 + 2] - c[2]
  return Math.sqrt(r * r * 0.9 + g * g * 1.2 + b * b * 0.9)
}
function dist(p: number[], c: number[]): number {
  const r = p[0] - c[0], g = p[1] - c[1], b = p[2] - c[2]
  return Math.sqrt(r * r * 0.9 + g * g * 1.2 + b * b * 0.9)
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** Sube un archivo/blob a la carpeta de Studio del comercio (flujo firmado + verificación). */
export async function uploadStudioImage(tenantSlug: string, file: Blob, onProgress?: (pct: number) => void): Promise<{ url: string }> {
  const base = `/api/${tenantSlug}/media`
  const signRes = await fetch(`${base}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surface: 'studio', kind: 'image' }) })
  const signed = await signRes.json()
  if (!signRes.ok) throw new Error(signed?.error || 'No se pudo preparar la subida')
  const form = new FormData()
  for (const [k, v] of Object.entries(signed.fields as Record<string, string>)) form.append(k, v)
  form.append('file', file, (file as File).name || 'foto.png')
  const up: { error?: { message?: string } } = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', signed.uploadUrl)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Respuesta inválida de Cloudinary')) } }
    xhr.onerror = () => reject(new Error('Se cortó la conexión durante la subida'))
    xhr.send(form)
  })
  if (up.error) throw new Error(up.error.message || 'Cloudinary rechazó la imagen')
  const confRes = await fetch(`${base}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surface: 'studio', kind: 'image', publicId: signed.publicId }) })
  const conf = await confRes.json()
  if (!confRes.ok) throw new Error(conf?.error || 'La imagen no cumple los requisitos')
  return { url: conf.media.url as string }
}
