export function normalizePhoneForDedup(phone: string): string {
  return phone.replace(/[\s\-().]/g, '').replace(/^0054/, '+54').replace(/^54/, '+54')
}

export function buildDedupMap(
  googleContacts: Array<{ name?: string; email?: string; phone?: string }>
): { phones: Set<string>; emails: Set<string> } {
  const phones = new Set<string>()
  const emails = new Set<string>()
  for (const c of googleContacts) {
    if (c.phone) phones.add(normalizePhoneForDedup(c.phone))
    if (c.email) emails.add(c.email.toLowerCase().trim())
  }
  return { phones, emails }
}

export function dedupContacts<T extends { phone?: string; email?: string }>(
  contacts: T[],
  dedupMap: { phones: Set<string>; emails: Set<string> }
): { toCreate: T[]; skipped: number } {
  const toCreate: T[] = []
  let skipped = 0
  for (const c of contacts) {
    const phone = c.phone ? normalizePhoneForDedup(c.phone) : null
    const email = c.email ? c.email.toLowerCase().trim() : null
    if ((phone && dedupMap.phones.has(phone)) || (email && dedupMap.emails.has(email))) {
      skipped++
    } else {
      toCreate.push(c)
    }
  }
  return { toCreate, skipped }
}

export interface GoogleContactInput {
  name: string
  phone?: string
  email?: string
}

export function transformConsumerToGoogle(c: {
  name: string
  phone?: string
  email?: string
}): GoogleContactInput {
  return {
    name: c.name || 'Sin nombre',
    phone: c.phone || undefined,
    email: c.email || undefined,
  }
}
