// ============================================================================
// Impresoras por DOCUMENTO (Fase 1 de configuración del POS, 29/10/2026)
// ============================================================================
// Antes cada impresora declaraba solo un rol (cocina / barra / caja). Ahora
// declara qué documentos imprime. Regla de origen:
//   · El SaaS (comercio sin POS) imprime solo comandas y tickets NO fiscales.
//   · El POS imprime todo: precuenta, factura, nota de crédito y reportes de
//     caja (X / Z).
// Compatibilidad: una impresora sin `documents` usa los de su rol, así las
// impresoras existentes siguen imprimiendo exactamente lo mismo.
// ============================================================================

export const PRINTER_DOCUMENTS = ["comanda", "ticket", "precuenta", "factura", "nota_credito", "reporte_caja"] as const
export type PrinterDocument = (typeof PRINTER_DOCUMENTS)[number]

export const PRINTER_DOCUMENT_LABELS: Record<PrinterDocument, string> = {
  comanda: "Comandas (cocina / barra)",
  ticket: "Ticket no fiscal",
  precuenta: "Precuenta de mesa",
  factura: "Factura (A / B / C)",
  nota_credito: "Nota de crédito",
  reporte_caja: "Reportes de caja (X / Z)",
}

/** Válidos como comprobante ante ARCA. */
export const FISCAL_DOCUMENTS: readonly PrinterDocument[] = ["factura", "nota_credito"]

/** Lo único que puede imprimir un comercio sin POS (desde el SaaS). */
export const SAAS_PRINTER_DOCUMENTS: readonly PrinterDocument[] = ["comanda", "ticket"]

/** Columnas de texto por ancho de papel. */
export const PAPER_COLUMNS: Record<58 | 80, number> = { 58: 32, 80: 48 }

type LegacyRole = "kitchen" | "bar" | "cashier"

const ROLE_DOCUMENTS: Record<LegacyRole, readonly PrinterDocument[]> = {
  kitchen: ["comanda"],
  bar: ["comanda"],
  cashier: ["ticket", "precuenta", "factura", "nota_credito", "reporte_caja"],
}

export function isPrinterDocument(value: unknown): value is PrinterDocument {
  return typeof value === "string" && (PRINTER_DOCUMENTS as readonly string[]).includes(value)
}

/** Documentos de una impresora: los declarados o, si no hay, los de su rol. */
export function effectiveDocuments(printer: { roles?: readonly string[] | null; documents?: readonly string[] | null }): PrinterDocument[] {
  const declared = (printer.documents ?? []).filter(isPrinterDocument)
  if (declared.length > 0) return [...new Set(declared)]
  const out = new Set<PrinterDocument>()
  for (const role of printer.roles ?? []) for (const d of ROLE_DOCUMENTS[role as LegacyRole] ?? []) out.add(d)
  return PRINTER_DOCUMENTS.filter((d) => out.has(d))
}

/** Documentos que este comercio puede asignar a una impresora. */
export function allowedPrinterDocuments(posEnabled: boolean): readonly PrinterDocument[] {
  return posEnabled ? PRINTER_DOCUMENTS : SAAS_PRINTER_DOCUMENTS
}

/**
 * Valida la lista que manda el cliente. Devuelve la lista limpia o el motivo
 * del rechazo (documento desconocido, o fiscal en un comercio sin POS).
 */
export function validatePrinterDocuments(
  input: unknown,
  posEnabled: boolean
): { ok: true; documents: PrinterDocument[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "documents debe ser una lista" }
  const allowed = allowedPrinterDocuments(posEnabled)
  const out: PrinterDocument[] = []
  for (const d of input) {
    if (!isPrinterDocument(d)) return { ok: false, error: `Documento desconocido: ${String(d)}` }
    if (!allowed.includes(d)) {
      return { ok: false, error: `«${PRINTER_DOCUMENT_LABELS[d]}» solo se imprime desde el POS` }
    }
    if (!out.includes(d)) out.push(d)
  }
  if (out.length === 0) return { ok: false, error: "Elegí al menos un documento" }
  return { ok: true, documents: out }
}

/** Rol de estilos (printSettings) que usa cada documento. */
export function styleRoleFor(doc: PrinterDocument): LegacyRole {
  return doc === "comanda" ? "kitchen" : "cashier"
}

/** Roles compatibles con los documentos elegidos (para el agente de impresión). */
export function rolesForDocuments(docs: readonly PrinterDocument[], current: readonly string[] = []): LegacyRole[] {
  const roles = new Set<LegacyRole>()
  if (docs.includes("comanda")) {
    // Conserva barra si la impresora ya era de barra.
    roles.add(current.includes("bar") && !current.includes("kitchen") ? "bar" : "kitchen")
  }
  if (docs.some((d) => d !== "comanda")) roles.add("cashier")
  return [...roles]
}
