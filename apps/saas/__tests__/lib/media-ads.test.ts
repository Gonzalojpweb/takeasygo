// CP3 (21/11/2026): medidas y límites, subida firmada a la cuenta ads,
// verificación posterior, aislamiento entre comercios y limpieza.
// La API de Cloudinary se simula: no se sube ni se borra nada real.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'
import { checkMedia, cropWarning, storyVideoDurationMs } from '@/lib/media/spec'
import { explainCloudinaryError } from '@/components/media/AdsMediaUpload'
import { signUpload, belongsTo, verifyUpload, adsAssetFromUrl, markSaved, folderFor, factsFromResource, type AdsApi } from '@/lib/media/ads'

beforeEach(() => {
  process.env.CLOUDINARY_ADS_CLOUD_NAME = 'tgoads'
  process.env.CLOUDINARY_ADS_API_KEY = '123456789012345'
  process.env.CLOUDINARY_ADS_API_SECRET = 'secreto-de-prueba-27-chars!'
  process.env.CLOUDINARY_ADS_FOLDER_ROOT = 'ads'
  process.env.CLOUDINARY_ADS_IMAGE_PRESET = 'tgo_ads_image'
  process.env.CLOUDINARY_ADS_VIDEO_PRESET = 'tgo_ads_video'
})

describe('checkMedia (medidas y límites)', () => {
  const img = { kind: 'image' as const, format: 'jpg', bytes: 1_000_000, width: 1080, height: 1920 }
  const vid = { kind: 'video' as const, format: 'mp4', bytes: 10_000_000, width: 1080, height: 1920, duration: 10 }

  it('acepta lo recomendado', () => {
    expect(checkMedia('story', img)).toBeNull()
    expect(checkMedia('story', vid)).toBeNull()
    expect(checkMedia('promo_card', { ...img, width: 800, height: 800 })).toBeNull()
    expect(checkMedia('home_banner', { ...img, width: 1200, height: 600 })).toBeNull()
  })

  it('imagen: formato, peso, lado máximo y mínimo por superficie, con el dato concreto', () => {
    expect(checkMedia('story', { ...img, format: 'gif' })).toMatch(/gif.*JPG, PNG, WebP o HEIC/)
    expect(checkMedia('story', { ...img, bytes: 9 * 1024 * 1024 })).toMatch(/9,0 MB; el máximo es 8 MB/)
    expect(checkMedia('story', { ...img, width: 7000, height: 9000 })).toMatch(/6000 px/)
    expect(checkMedia('story', { ...img, width: 600, height: 1000 })).toMatch(/600×1000.*lado más corto.*720 px/)
    expect(checkMedia('promo_card', { ...img, width: 300, height: 300 })).toMatch(/al menos 400 px/)
  })

  it('imagen con otra proporción se ACEPTA (con aviso de recorte); el lado corto manda', () => {
    // Una foto horizontal común sirve para una story (antes se rechazaba).
    expect(checkMedia('story', { ...img, width: 1920, height: 1080 })).toBeNull()
    expect(cropWarning('story', 1920, 1080)).toMatch(/1920×1080.*9:16.*recortar/)
    expect(cropWarning('story', 1080, 1920)).toBeNull()
    expect(cropWarning('promo_card', 1000, 900)).toBeNull() // ±15 %
    expect(checkMedia('club_card', { ...img, width: 1200, height: 900 })).toBeNull()
    expect(checkMedia('club_card', { ...img, width: 800, height: 400 })).toMatch(/al menos 450 px/)
    expect(checkMedia('qr_promo', { ...img, width: 400, height: 400 })).toBeNull()
    expect(checkMedia('qr_promo', { ...img, width: 150, height: 300 })).toMatch(/al menos 200 px/)
    expect(checkMedia('club_card', vid)).toMatch(/solo acepta imágenes/)
  })

  it('errores de Cloudinary con mensaje claro (firma, key, preset, peso)', () => {
    expect(explainCloudinaryError('Invalid Signature 2b3c... String to sign', 'image')).toMatch(/CLOUDINARY_ADS_API_SECRET/)
    expect(explainCloudinaryError('Invalid api_key 123', 'image')).toMatch(/CLOUDINARY_ADS_API_KEY/)
    expect(explainCloudinaryError('Upload preset not found', 'image')).toMatch(/preset/)
    expect(explainCloudinaryError('File size too large. Got 99. Maximum is 8.', 'video')).toMatch(/30 MB/)
    expect(explainCloudinaryError('otra cosa', 'image')).toMatch(/otra cosa/)
  })

  it('video: solo en story, duración 3–15 s, peso, vertical entre 9:16 y 4:5', () => {
    expect(checkMedia('promo_card', vid)).toMatch(/solo acepta imágenes/)
    expect(checkMedia('story', { ...vid, duration: 22 })).toMatch(/dura 22 s; el máximo es 15 s/)
    expect(checkMedia('story', { ...vid, duration: 2 })).toMatch(/mínimo es 3 s/)
    expect(checkMedia('story', { ...vid, duration: null })).toMatch(/duración/)
    expect(checkMedia('story', { ...vid, bytes: 40 * 1024 * 1024 })).toMatch(/máximo es 30 MB/)
    expect(checkMedia('story', { ...vid, width: 1920, height: 1080 })).toMatch(/horizontal/)
    expect(checkMedia('story', { ...vid, width: 1080, height: 1080 })).toMatch(/entre 9:16 y 4:5/)
    expect(checkMedia('story', { ...vid, width: 1080, height: 1350 })).toBeNull() // 4:5
    expect(checkMedia('story', { ...vid, format: 'avi' })).toMatch(/MP4, MOV o WebM/)
  })

  it('duración del visor: real y con tope de 15 s', () => {
    expect(storyVideoDurationMs(9.4)).toBe(9400)
    expect(storyVideoDurationMs(20)).toBe(15000)
    expect(storyVideoDurationMs(null)).toBeNull()
  })
})

describe('signUpload', () => {
  it('firma con el secreto, ruta del dueño, preset y etiqueta pending; video con portada y 720p asíncronos', () => {
    const s = signUpload({ kind: 'tenant', tenantId: 'abc' }, 'promo_card', 'image', 1_700_000_000_000)
    expect(s.uploadUrl).toBe('https://api.cloudinary.com/v1_1/tgoads/image/upload')
    expect(s.publicId).toMatch(/^ads\/t-abc\/promo_card\/[a-f0-9]{18}$/)
    expect(s.fields).toMatchObject({ public_id: s.publicId, upload_preset: 'tgo_ads_image', tags: 'pending', api_key: '123456789012345', timestamp: '1700000000' })
    expect(s.fields.api_secret).toBeUndefined()
    const { signature, api_key, ...signed } = s.fields
    expect(signature).toBe(cloudinary.utils.api_sign_request(signed, 'secreto-de-prueba-27-chars!'))
    expect(api_key).toBeTruthy()

    const v = signUpload({ kind: 'platform' }, 'story', 'video')
    expect(v.uploadUrl).toMatch(/\/video\/upload$/)
    expect(v.fields.upload_preset).toBe('tgo_ads_video')
    expect(v.fields.eager).toBe('c_limit,h_1280,q_auto,vc_h264,w_720/mp4|c_limit,h_1280,so_0,w_720/jpg')
    expect(v.fields.eager_async).toBe('true')
  })

  it('rechaza superficie o tipo no admitidos; sin credenciales no firma', () => {
    expect(() => signUpload({ kind: 'platform' }, 'promo_card', 'video')).toThrow()
    delete process.env.CLOUDINARY_ADS_API_SECRET
    expect(() => signUpload({ kind: 'platform' }, 'story', 'image')).toThrow(/credenciales/)
  })
})

function fakeApi(info: Record<string, unknown> | null): AdsApi & { destroyed: string[]; untagged: string[] } {
  const api = {
    destroyed: [] as string[],
    untagged: [] as string[],
    resource: vi.fn(async () => info as never),
    destroy: vi.fn(async (pid: string) => { api.destroyed.push(pid) }),
    removePendingTag: vi.fn(async (pid: string) => { api.untagged.push(pid) }),
  }
  return api
}

describe('verifyUpload', () => {
  const A = { kind: 'tenant' as const, tenantId: 'aaa' }
  const B = { kind: 'tenant' as const, tenantId: 'bbb' }
  const pidA = `${folderFor(A, 'promo_card')}/${'1'.repeat(18)}`

  it('aislamiento: un archivo de otro comercio se rechaza SIN tocarlo', async () => {
    const api = fakeApi({ format: 'jpg', bytes: 1, width: 800, height: 800 })
    const r = await verifyUpload(B, 'promo_card', 'image', pidA, api)
    expect(r).toMatchObject({ ok: false, status: 403, deleted: false })
    expect(api.resource).not.toHaveBeenCalled()
    expect(api.destroyed).toEqual([])
    expect(belongsTo(pidA, A, 'promo_card')).toBe(true)
    expect(belongsTo(pidA, A, 'story')).toBe(false)
    expect(belongsTo(`${pidA}/../x`, A, 'promo_card')).toBe(false)
  })

  it('no cumple → se borra y se explica el motivo', async () => {
    const api = fakeApi({ format: 'jpg', bytes: 1000, width: 300, height: 300, secure_url: 'https://x' })
    const r = await verifyUpload(A, 'promo_card', 'image', pidA, api)
    expect(r).toMatchObject({ ok: false, status: 422, deleted: true })
    expect((r as { error: string }).error).toMatch(/300×300/)
    expect(api.destroyed).toEqual([pidA])
  })

  it('no existe → 404 sin borrar', async () => {
    const api = fakeApi(null)
    expect(await verifyUpload(A, 'promo_card', 'image', pidA, api)).toMatchObject({ ok: false, status: 404, deleted: false })
  })

  it('video que cumple → URL 720p, portada y duración real', async () => {
    const P = { kind: 'platform' as const }
    const pid = `${folderFor(P, 'story')}/${'a'.repeat(18)}`
    const api = fakeApi({ format: 'mp4', bytes: 5_000_000, width: 1080, height: 1920, duration: 9.4 })
    const r = await verifyUpload(P, 'story', 'video', pid, api)
    expect(r.ok).toBe(true)
    const m = (r as { media: { url: string; posterUrl: string; durationMs: number } }).media
    expect(m.url).toBe(`https://res.cloudinary.com/tgoads/video/upload/c_limit,h_1280,q_auto,vc_h264,w_720/v1/${pid}.mp4`)
    expect(m.posterUrl).toBe(`https://res.cloudinary.com/tgoads/video/upload/c_limit,h_1280,so_0,w_720/v1/${pid}.jpg`)
    expect(m.durationMs).toBe(9400)
    expect(api.destroyed).toEqual([])
  })
})

describe('al guardar: quitar pending solo a archivos de la cuenta ads', () => {
  it('reconoce URLs ads (imagen y video con transformaciones); ignora menús y URLs ajenas', async () => {
    const img = 'https://res.cloudinary.com/tgoads/image/upload/v17/ads/platform/story/abcdef.jpg'
    const vid = 'https://res.cloudinary.com/tgoads/video/upload/c_limit,h_1280,q_auto,vc_h264,w_720/v1/ads/t-x/story/xyz.mp4?_a=1'
    expect(adsAssetFromUrl(img)).toEqual({ publicId: 'ads/platform/story/abcdef', kind: 'image' })
    expect(adsAssetFromUrl(vid)).toEqual({ publicId: 'ads/t-x/story/xyz', kind: 'video' })
    expect(adsAssetFromUrl('https://res.cloudinary.com/otra-cuenta/image/upload/v1/ads/platform/story/a.jpg')).toBeNull()
    expect(adsAssetFromUrl('https://ejemplo.com/a.jpg')).toBeNull()

    const api = fakeApi(null)
    await markSaved([img, img, vid, 'https://res.cloudinary.com/menus/image/upload/v1/takeasygo/x.jpg', '', null], api)
    expect(api.untagged).toEqual(['ads/platform/story/abcdef', 'ads/t-x/story/xyz'])
  })

  it('sin credenciales ads (p. ej., tests de otras rutas) no llama a Cloudinary', async () => {
    delete process.env.CLOUDINARY_ADS_CLOUD_NAME
    const api = fakeApi(null)
    await markSaved(['https://res.cloudinary.com/tgoads/image/upload/v1/ads/platform/story/a.jpg'], api)
    expect(api.removePendingTag).not.toHaveBeenCalled()
  })
})

describe('video: duración y rotación desde media_metadata (21/11/2026)', () => {
  it('la duración viene en video_metadata (la consulta simple no la trae)', () => {
    expect(factsFromResource({ format: 'mp4', bytes: 1, width: 1080, height: 1920, video_metadata: { duration: 15.03 } }, 'video').duration).toBe(15.03)
    expect(factsFromResource({ format: 'mp4', width: 1080, height: 1920 }, 'video').duration).toBeNull()
  })
  it('reel vertical guardado «rotado 90°» (1920×1080) cuenta como vertical', () => {
    const f = factsFromResource({ format: 'mov', width: 1920, height: 1080, video_metadata: { duration: 12, rotation: 90 } }, 'video')
    expect([f.width, f.height]).toEqual([1080, 1920])
    expect(checkMedia('story', { kind: 'video', ...f })).toBeNull()
  })
  it('un reel «0:15» (15,9 s) pasa; 16 s no', () => {
    const v = { kind: 'video' as const, format: 'mp4', bytes: 1000, width: 1080, height: 1920 }
    expect(checkMedia('story', { ...v, duration: 15.9 })).toBeNull()
    expect(checkMedia('story', { ...v, duration: 16 })).toMatch(/máximo es 15 s/)
  })
  it('verificación de punta a punta con video_metadata: no se borra y devuelve la duración', async () => {
    const P = { kind: 'platform' as const }
    const pid = `${folderFor(P, 'story')}/${'b'.repeat(18)}`
    const api = fakeApi({ format: 'mp4', bytes: 9_000_000, width: 1080, height: 1920, video_metadata: { duration: 15.03 } })
    const r = await verifyUpload(P, 'story', 'video', pid, api)
    expect(r.ok).toBe(true)
    expect((r as { media: { durationMs: number } }).media.durationMs).toBe(15030)
    expect(api.destroyed).toEqual([])
  })
})
