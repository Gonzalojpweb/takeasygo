// ============================================================================
// sold-out-options.test.ts — marcar / reponer sabores agotados (19/11)
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import { setOptionSoldOut } from '@/lib/menu/sold-out-options.server'
import { flattenMenu } from '@takeasygo/business'

const tenantId = new mongoose.Types.ObjectId()
const locationId = new mongoose.Types.ObjectId()
let catFlavor: string
let itemExtra: string
let variantOpt: string

beforeEach(async () => {
  const flavors = Array.from({ length: 14 }, (_, i) => ({ name: `Sabor ${i}`, extraPrice: 0, section: i < 7 ? 'Cremas' : 'Frutales' }))
  const menu = await Menu.create({
    tenantId, locationId,
    categories: [{
      name: 'Helados',
      customizationGroups: [{ name: 'Sabores', type: 'multiple', maxSelections: 4, options: flavors }],
      items: [{
        name: '¼ kg', price: 650000,
        customizationGroups: [{ name: 'Extras', options: [{ name: 'Rocklets', extraPrice: 50000 }] }],
        variants: [{ name: 'Grande', price: 700000, customizationGroups: [{ name: 'Baño', options: [{ name: 'Chocolate' }] }] }],
      }],
    }],
  }) as any
  catFlavor = String(menu.categories[0].customizationGroups[0].options[3]._id)
  itemExtra = String(menu.categories[0].items[0].customizationGroups[0].options[0]._id)
  variantOpt = String(menu.categories[0].items[0].variants[0].customizationGroups[0].options[0]._id)
})

describe('setOptionSoldOut', () => {
  it('opción de grupo de categoría → lista de la categoría; reponer la saca', async () => {
    const t = await setOptionSoldOut(tenantId, locationId, catFlavor, true)
    expect(t?.owner).toBe('category')
    let menu = await Menu.findOne({ tenantId }).lean<any>()
    expect(menu.categories[0].soldOutOptionIds).toEqual([catFlavor])

    await setOptionSoldOut(tenantId, locationId, catFlavor, true) // idempotente
    menu = await Menu.findOne({ tenantId }).lean<any>()
    expect(menu.categories[0].soldOutOptionIds).toEqual([catFlavor])

    await setOptionSoldOut(tenantId, locationId, catFlavor, false)
    menu = await Menu.findOne({ tenantId }).lean<any>()
    expect(menu.categories[0].soldOutOptionIds).toEqual([])
  })

  it('opción propia del plato o de su variante → lista del ítem', async () => {
    expect((await setOptionSoldOut(tenantId, locationId, itemExtra, true))?.owner).toBe('item')
    expect((await setOptionSoldOut(tenantId, locationId, variantOpt, true))?.owner).toBe('item')
    const menu = await Menu.findOne({ tenantId }).lean<any>()
    expect(menu.categories[0].items[0].soldOutOptionIds.sort()).toEqual([itemExtra, variantOpt].sort())
  })

  it('no toca nada fuera de la sede ni con un id que no existe', async () => {
    expect(await setOptionSoldOut(tenantId, new mongoose.Types.ObjectId(), catFlavor, true)).toBeNull()
    expect(await setOptionSoldOut(tenantId, locationId, String(new mongoose.Types.ObjectId()), true)).toBeNull()
  })

  it('no pisa un cambio del menú hecho en el medio', async () => {
    await Menu.updateOne({ tenantId }, { $set: { 'categories.0.items.0.price': 777 } })
    await setOptionSoldOut(tenantId, locationId, catFlavor, true)
    const menu = await Menu.findOne({ tenantId }).lean<any>()
    expect(menu.categories[0].items[0].price).toBe(777)
  })

  it('el catálogo del POS lleva id, familia y agotado', async () => {
    await setOptionSoldOut(tenantId, locationId, catFlavor, true)
    const menu = await Menu.findOne({ tenantId }).lean<any>()
    const { products } = flattenMenu(menu)
    const sabores = products[0].modifiers!.find(m => m.name === 'Sabores')!
    const opt = sabores.options.find(o => o.id === catFlavor)!
    expect(opt.soldOut).toBe(true)
    expect(opt.section).toBe('Cremas')
    expect(sabores.options.filter(o => o.soldOut)).toHaveLength(1)
  })
})
