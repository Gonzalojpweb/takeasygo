import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import './setup'

import User from '@/models/User'

/**
 * Hook pre('save') de models/User.ts.
 *
 * Corrige usuarios guardados en texto plano (paso B): el modelo no tenía
 * hook de hash y create-test-users.ts guardaba la contraseña sin cifrar,
 * lo que rompía CredentialsSignin. Reglas:
 *   1. password en texto plano  -> se guarda hasheado (bcrypt).
 *   2. password ya bcrypt ($2…) -> NO se re-cifra.
 *   3. save() sin tocar password -> hash intacto.
 */

const PLAIN = 'SuperSecret-123!'

describe('User password hook (pre save)', () => {
  beforeAll(async () => {
    await mongoose.connection.dropDatabase()
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
  })

  it('hashea una contraseña en texto plano al crear', async () => {
    const user = await User.create({
      name: 'Plain User',
      email: 'plain@hook.test',
      password: PLAIN,
      role: 'staff',
    })
    expect(user.password).toMatch(/^\$2[aby]\$/)
    expect(await bcrypt.compare(PLAIN, user.password!)).toBe(true)
  })

  it('no re-cifra una contraseña que ya está en formato bcrypt', async () => {
    const alreadyHashed = await bcrypt.hash(PLAIN, 10)
    const user = await User.create({
      name: 'Hashed User',
      email: 'hashed@hook.test',
      password: alreadyHashed,
      role: 'staff',
    })
    expect(user.password).toBe(alreadyHashed)
    expect(await bcrypt.compare(PLAIN, user.password!)).toBe(true)
  })

  it('reconoce un hash bcrypt real aunque el valor literal empiece con $2', async () => {
    const realHash = bcrypt.hashSync('OtraClave-789$', 12)
    expect(realHash.startsWith('$2')).toBe(true)
    const user = await User.create({
      name: 'Literal Hash',
      email: 'literal-hash@hook.test',
      password: realHash,
      role: 'staff',
    })
    expect(user.password).toBe(realHash)
    expect(await bcrypt.compare('OtraClave-789$', user.password!)).toBe(true)
  })

  it('cifra un string que empieza con $2 pero NO es formato bcrypt válido', async () => {
    const fake = '$2esto-no-es-un-hash-real-de-bcrypt'
    const user = await User.create({
      name: 'Fake Bcrypt',
      email: 'fake-bcrypt@hook.test',
      password: fake,
      role: 'staff',
    })
    expect(user.password).not.toBe(fake)
    expect(user.password).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/)
    expect(await bcrypt.compare(fake, user.password!)).toBe(true)
  })

  it('no toca el hash en un save() que no modifica password', async () => {
    const user = await User.create({
      name: 'Stable User',
      email: 'stable@hook.test',
      password: PLAIN,
      role: 'staff',
    })
    const hashBefore = user.password

    user.name = 'Stable User Renamed'
    await user.save()

    expect(user.password).toBe(hashBefore)
  })

  it('re-cifra cuando se cambia la contraseña a texto plano', async () => {
    const user = await User.create({
      name: 'Changer User',
      email: 'changer@hook.test',
      password: PLAIN,
      role: 'staff',
    })
    const hashBefore = user.password

    user.password = 'NuevaClave-456!'
    await user.save()

    expect(user.password).not.toBe(hashBefore)
    expect(user.password).toMatch(/^\$2[aby]\$/)
    expect(await bcrypt.compare('NuevaClave-456!', user.password!)).toBe(true)
  })

  it('guarda sin password (consumidor sin credenciales)', async () => {
    const user = await User.create({
      name: 'No Password',
      email: 'nopass@hook.test',
      role: 'consumer',
    })
    expect(user.password).toBeUndefined()
  })
})
