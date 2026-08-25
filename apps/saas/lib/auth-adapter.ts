/* eslint-disable @typescript-eslint/no-explicit-any */
import { connectDB } from '@/lib/mongoose'

let UserModel: any = null
let AccountModel: any = null
let VerificationTokenModel: any = null

async function ensureDB() {
  await connectDB()
  if (!UserModel) {
    UserModel = (await import('@/models/User')).default
    AccountModel = (await import('@/models/Account')).default
    VerificationTokenModel = (await import('@/models/VerificationToken')).default
  }
}

function toAdapterUser(user: any) {
  return {
    id: user._id.toString(),
    name: user.name ?? null,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? null,
    image: user.image ?? null,
  }
}

function toAdapterAccount(account: any) {
  return {
    id: account._id.toString(),
    userId: account.userId.toString(),
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refresh_token: account.refresh_token ?? undefined,
    access_token: account.access_token ?? undefined,
    expires_at: account.expires_at ?? undefined,
    token_type: account.token_type ?? undefined,
    scope: account.scope ?? undefined,
    id_token: account.id_token ?? undefined,
    session_state: account.session_state ?? undefined,
  }
}

export const adapter: any = {
  async createUser(user: any) {
    await ensureDB()
    const created = await UserModel.findOneAndUpdate(
      { email: user.email },
      {
        $setOnInsert: {
          name: user.name ?? 'Usuario',
          email: user.email,
          image: user.image,
          role: 'consumer',
          isActive: true,
          emailVerified: user.emailVerified ?? null,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    )
    return toAdapterUser(created)
  },

  async getUser(id: string) {
    await ensureDB()
    const user = await UserModel.findById(id).lean()
    if (!user) return null
    return toAdapterUser(user)
  },

  async getUserByEmail(email: string) {
    await ensureDB()
    const user = await UserModel.findOne({ email }).lean()
    if (!user) return null
    return toAdapterUser(user)
  },

  async getUserByAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
    await ensureDB()
    const account = await AccountModel.findOne({ provider, providerAccountId }).lean()
    if (!account) return null
    const user = await UserModel.findById(account.userId).lean()
    if (!user) return null
    return toAdapterUser(user)
  },

  async updateUser(user: any) {
    await ensureDB()
    const updated = await UserModel.findByIdAndUpdate(
      user.id,
      { $set: { name: user.name, email: user.email, image: user.image, emailVerified: user.emailVerified } },
      { returnDocument: "after" }
    ).lean()
    if (!updated) throw new Error('User not found')
    return toAdapterUser(updated)
  },

  async deleteUser(userId: string) {
    await ensureDB()
    await AccountModel.deleteMany({ userId })
    await UserModel.findByIdAndDelete(userId)
  },

  async linkAccount(account: any) {
    await ensureDB()
    const created = await AccountModel.create({
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: account.refresh_token,
      access_token: account.access_token,
      expires_at: account.expires_at,
      token_type: account.token_type,
      scope: account.scope,
      id_token: account.id_token,
      session_state: account.session_state,
    })
    return toAdapterAccount(created)
  },

  async unlinkAccount({ provider, providerAccountId }: { provider: string; providerAccountId: string }) {
    await ensureDB()
    await AccountModel.findOneAndDelete({ provider, providerAccountId })
  },

  async createVerificationToken(verificationToken: any) {
    await ensureDB()
    const created = await VerificationTokenModel.create({
      identifier: verificationToken.identifier,
      token: verificationToken.token,
      expires: verificationToken.expires,
    })
    return {
      identifier: created.identifier,
      token: created.token,
      expires: created.expires,
    }
  },

  async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
    await ensureDB()
    const found = await VerificationTokenModel.findOneAndDelete({ identifier, token }).lean()
    if (!found) return null
    return {
      identifier: found.identifier,
      token: found.token,
      expires: found.expires,
    }
  },

  async getAccount(providerAccountId: string, provider: string) {
    await ensureDB()
    const account = await AccountModel.findOne({ provider, providerAccountId }).lean()
    if (!account) return null
    return toAdapterAccount(account)
  },

  // JWT strategy — session methods not used, return null explicitly
  async createSession() { return null },
  async getSessionAndUser() { return null },
  async updateSession() { return null },
  async deleteSession() { return null },
}
