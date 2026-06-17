export function excludeDeleted<T extends Record<string, any>>(filter: T): T & { deletedAt: null } {
  return { ...filter, deletedAt: null }
}
