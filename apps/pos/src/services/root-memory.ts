// ============================================================================
// Memoria del equipo para el root (obs. UX 25/10 — «entrar es recordar»)
// ============================================================================
// El operador no tipea códigos de sistema: el equipo recuerda en qué comercio
// trabaja (tenantId) y quién entró por última vez (nombre, rol, sede, modo).
// Solo datos de PRESENTACIÓN y el id del comercio — nunca PIN, contraseña ni
// token. Vive en localStorage del equipo; sin storage, el root funciona igual
// (cae al panel técnico o a email).
// ============================================================================

const KEY = "takeasygo-pos-root-memory"

export interface RootMemory {
  tenantId: string
  tenantName: string
  /** Último usuario (se puede olvidar con «Cambiar de usuario»). */
  user: { name: string; role: string; mode: "pin" | "email"; email?: string } | null
  locationId: string | null
  locationName: string | null
  at: string
}

export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

function storage(): StorageLike | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null
  } catch {
    return null
  }
}

export function readRootMemory(s: StorageLike | null = storage()): RootMemory | null {
  try {
    const raw = s?.getItem(KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as Partial<RootMemory>
    if (typeof m.tenantId !== "string" || !m.tenantId) return null
    return {
      tenantId: m.tenantId,
      tenantName: typeof m.tenantName === "string" ? m.tenantName : "",
      user: m.user && typeof m.user.name === "string" ? m.user : null,
      locationId: typeof m.locationId === "string" ? m.locationId : null,
      locationName: typeof m.locationName === "string" ? m.locationName : null,
      at: typeof m.at === "string" ? m.at : "",
    }
  } catch {
    return null
  }
}

export function writeRootMemory(m: RootMemory, s: StorageLike | null = storage()): void {
  try { s?.setItem(KEY, JSON.stringify(m)) } catch { /* sin storage: no se recuerda */ }
}

/** «Cambiar de usuario»: olvida la persona, conserva el comercio del equipo. */
export function forgetRootUser(s: StorageLike | null = storage()): RootMemory | null {
  const m = readRootMemory(s)
  if (!m) return null
  const next = { ...m, user: null }
  writeRootMemory(next, s)
  return next
}

/** Iniciales para el avatar del último usuario. */
export function initialsOf(name: string): string {
  return (name || "?").split(/\s+/).filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", manager: "Encargado", cashier: "Cajero", waiter: "Mozo" }
export function roleLabelOf(role: string | undefined | null): string {
  return (role && ROLE_LABEL[role]) || "Operador"
}
