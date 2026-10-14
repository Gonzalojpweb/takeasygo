// ============================================================================
// rbac-matrix-sync.test.ts — Consistencia rbac-client vs rbac (servidor)
// ============================================================================
// La matriz de permisos existe en dos lugares:
//   - lib/rbac.ts          (servidor, fuente de verdad, se usa en enforcePermission)
//   - lib/rbac-client.ts   (client-safe, se usa en AdminSidebar para el menú)
// Si se apartan, el sidebar mostraría/ocultaría items incorrectamente.
// Este test compara ambas y FALTA si divergen.
//
// Ejecutar: npx vitest run __tests__/lib/rbac-matrix-sync.test.ts
// ============================================================================

import { describe, it, expect, vi } from 'vitest'

// rbac.ts importa @/lib/apiAuth → next-auth; mockear antes del import.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }))

import { ROLE_PERMISSIONS, type Permission } from '@/lib/rbac'
import { CLIENT_ROLE_PERMISSIONS, type ClientPermission } from '@/lib/rbac-client'

const SERVER_ROLES = Object.keys(ROLE_PERMISSIONS).sort()
const CLIENT_ROLES = Object.keys(CLIENT_ROLE_PERMISSIONS).sort()

describe('Matriz rbac-client vs rbac (servidor)', () => {
  it('los roles son idénticos en ambos archivos', () => {
    expect(CLIENT_ROLES).toEqual(SERVER_ROLES)
  })

  it('cada rol tiene exactamente los mismos permisos en cliente y servidor', () => {
    for (const role of SERVER_ROLES) {
      const server = [...(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] as readonly string[])].sort()
      const client = [...(CLIENT_ROLE_PERMISSIONS[role as keyof typeof CLIENT_ROLE_PERMISSIONS] as readonly string[])].sort()
      expect(client, `Permisos divergentes para rol "${role}"`).toEqual(server)
    }
  })

  it('admin tiene todos los permisos en ambos archivos', () => {
    const serverAdmin = ROLE_PERMISSIONS.admin as readonly Permission[]
    const clientAdmin = CLIENT_ROLE_PERMISSIONS.admin as readonly ClientPermission[]
    // Todos los permisos del servidor deben estar en el cliente y viceversa.
    expect([...clientAdmin].sort()).toEqual([...serverAdmin].sort())
  })

  it('waiter NO tiene reservations.write en ninguno de los dos (corrección Gonzalo 2026-10-13)', () => {
    const serverWaiter = ROLE_PERMISSIONS.waiter as readonly string[]
    const clientWaiter = CLIENT_ROLE_PERMISSIONS.waiter as readonly string[]
    expect(serverWaiter).not.toContain('reservations.write')
    expect(clientWaiter).not.toContain('reservations.write')
  })

  it('auditor NO tiene reports.view_consolidated como permiso de sede en cliente (solo server, y exige tenant-wide ULR)', () => {
    // El cliente no resuelve tenant-wide; el consolidado se maneja en server.
    // Ambos archivos deben ser consistentes en la matriz base.
    const serverAuditor = ROLE_PERMISSIONS.auditor as readonly string[]
    const clientAuditor = CLIENT_ROLE_PERMISSIONS.auditor as readonly string[]
    expect([...clientAuditor].sort()).toEqual([...serverAuditor].sort())
  })

  it('staff NO tiene users.read ni settings.write en ninguno de los dos', () => {
    const serverStaff = ROLE_PERMISSIONS.staff as readonly string[]
    const clientStaff = CLIENT_ROLE_PERMISSIONS.staff as readonly string[]
    expect(serverStaff).not.toContain('users.read')
    expect(serverStaff).not.toContain('settings.write')
    expect(clientStaff).not.toContain('users.read')
    expect(clientStaff).not.toContain('settings.write')
  })
})
