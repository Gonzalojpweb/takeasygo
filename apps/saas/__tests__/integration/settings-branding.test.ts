// ============================================================================
// settings-branding.test.ts — Guardado de la identidad del local
// ============================================================================
// PUT /api/[tenant]/settings/branding solo acepta campos conocidos. El color
// «Contenedor Sección» (fondo de Destacados) se descartaba porque faltaba en
// esa lista; además, guardar invalida el caché de los menús públicos.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import Tenant from '@/models/Tenant'
import { PUT as saveBranding } from '@/app/api/[tenant]/settings/branding/route'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

const SLUG = 'branding-test'
let tenant: any

beforeEach(async () => {
  vi.clearAllMocks()
  tenant = await Tenant.create({ slug: SLUG, name: 'Branding', isActive: true, status: 'active', plan: 'try' })
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'a1', role: 'admin', tenantId: tenant._id.toString(), assignedLocations: [] },
    expires: '',
  } as any)
})

const put = (branding: Record<string, unknown>) =>
  saveBranding(
    new NextRequest(`http://localhost/api/${SLUG}/settings/branding`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branding }),
    }),
    { params: Promise.resolve({ tenant: SLUG }) },
  )

const stored = async () => ((await Tenant.findById(tenant._id).lean()) as any).branding

describe('identidad — color del contenedor de sección', () => {
  it('guarda el fondo de Destacados junto al resto de los colores', async () => {
    const res = await put({ primaryColor: '#E8590C', sectionContainerColor: '#FFF4E6' })
    expect(res.status).toBe(200)
    const b = await stored()
    expect(b.sectionContainerColor).toBe('#FFF4E6')
    expect(b.primaryColor).toBe('#E8590C')
  })

  it('permite volver al fondo por defecto (vacío)', async () => {
    await put({ sectionContainerColor: '#FFF4E6' })
    await put({ sectionContainerColor: '' })
    expect((await stored()).sectionContainerColor).toBe('')
  })

  it('rechaza un color inválido sin guardar nada', async () => {
    const res = await put({ primaryColor: '#000000', sectionContainerColor: 'url(javascript:alert(1))' })
    expect(res.status).toBe(400)
    const b = await stored()
    expect(b.sectionContainerColor).toBe('')
    expect(b.primaryColor).not.toBe('#000000')
  })

  it('invalida el caché de las páginas públicas del local', async () => {
    await put({ sectionContainerColor: '#FFF4E6' })
    expect(revalidatePath).toHaveBeenCalledWith(`/${SLUG}`, 'layout')
  })
})
