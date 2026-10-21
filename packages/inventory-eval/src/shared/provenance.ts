// ============================================================================
// Parameter Provenance Registry (V-A §26–27)
// ============================================================================
// Todo parámetro del experimento declara de dónde sale. Un parámetro sin
// procedencia no entra en una corrida confirmatoria: así no se eligen números
// "a medida" para que TGO gane. Congelado, no se puede cambiar.
// ============================================================================

export type ProvenanceKind =
  /** Dato publicado o medido fuera del proyecto. */
  | 'external_evidence'
  /** Rango razonable justificado; se barre en el análisis de sensibilidad. */
  | 'justified_range'
  /** Supuesto no validado: se declara como tal y se reporta. */
  | 'unvalidated_assumption'

export interface ParameterRecord {
  name: string
  value: unknown
  kind: ProvenanceKind
  source: string
  /** Fecha de congelamiento: después no se toca mirando resultados. */
  frozenAt?: string
}

export class ProvenanceRegistry {
  private readonly records = new Map<string, ParameterRecord>()

  register(record: ParameterRecord): void {
    const prev = this.records.get(record.name)
    if (prev?.frozenAt) throw new Error(`Parámetro congelado: ${record.name} (desde ${prev.frozenAt})`)
    this.records.set(record.name, record)
  }

  freeze(at: string = new Date().toISOString()): void {
    for (const r of this.records.values()) r.frozenAt ??= at
  }

  get(name: string): ParameterRecord | undefined {
    return this.records.get(name)
  }

  /** Exportable al manifiesto del experimento (V-E §55). */
  toJSON(): ParameterRecord[] {
    return [...this.records.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}
