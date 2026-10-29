import { useEffect, useState, type ReactNode } from "react"
import { HelpCircle, X } from "lucide-react"

// ============================================================================
// Centro de ayuda — Factura electrónica (Fase L, 2026-10)
// ============================================================================
// Pedido 24/10: «agregar centro de ayuda en factura electrónica, donde se le
// explica al cliente todo». Lenguaje simple, pensado para la caja y el
// encargado. No se publican montos ni topes de ARCA (cambian seguido): se
// indica dónde consultarlos. Se abre desde el contexto Facturación y desde el
// cobro (botón «?»). Teclado: Esc cierra.
// ============================================================================

interface Topic { id: string; title: string; body: ReactNode }

const TOPICS: Topic[] = [
  {
    id: "que-es",
    title: "¿Qué es la factura electrónica?",
    body: (
      <>
        <p>Es el comprobante oficial de cada venta, autorizado por <strong>ARCA</strong> (ex AFIP). El POS lo pide automáticamente al cobrar: ARCA responde con un <strong>CAE</strong> (Código de Autorización Electrónico) y su vencimiento, y el ticket sale impreso con el <strong>código QR</strong> que el cliente puede verificar.</p>
        <p>Sin CAE, el comprobante no es válido. Por eso cada comprobante muestra su estado.</p>
      </>
    ),
  },
  {
    id: "abc",
    title: "Factura A, B o C: ¿cuál corresponde?",
    body: (
      <>
        <p>Lo decide la condición de IVA del <strong>comercio</strong> y la del <strong>cliente</strong>. El POS la elige solo según lo configurado:</p>
        <ul>
          <li><strong>Comercio Responsable Inscripto:</strong> Factura <strong>A</strong> a otro Responsable Inscripto (con CUIT); Factura <strong>B</strong> a consumidor final, monotributista o exento.</li>
          <li><strong>Comercio Monotributista:</strong> siempre Factura <strong>C</strong>.</li>
        </ul>
        <p>Si el cliente pide factura «a nombre de la empresa», elegí <em>Con CUIT</em> en el cobro y cargá el CUIT y su condición.</p>
      </>
    ),
  },
  {
    id: "consumidor-final",
    title: "Consumidor final: ¿hay que pedir el DNI?",
    body: (
      <>
        <p>En la mayoría de las ventas no. ARCA exige <strong>identificar al consumidor final</strong> (DNI o CUIT) cuando la venta supera un monto que fija y actualiza periódicamente. Si el monto lo requiere, pedí el documento y cargalo en el cobro.</p>
        <p>El monto vigente lo informa ARCA en su sitio (régimen de facturación, «identificación del consumidor final»). Ante la duda, consultá a tu contador.</p>
      </>
    ),
  },
  {
    id: "cuit",
    title: "Facturar con CUIT (empresas)",
    body: (
      <>
        <p>El CUIT tiene 11 dígitos y el POS verifica que el dígito verificador sea correcto. Elegí la condición del cliente (Responsable Inscripto, Monotributo o Exento) y, si querés, su razón social.</p>
        <p>Si ARCA rechaza el comprobante por el CUIT, el comprobante queda <strong>Rechazado</strong> con el motivo: corregí el dato y tocá <strong>Reintentar</strong>.</p>
      </>
    ),
  },
  {
    id: "estados",
    title: "Estados de un comprobante",
    body: (
      <ul>
        <li><strong>Autorizado:</strong> tiene CAE. Es válido y se imprime con QR.</li>
        <li><strong>Contingencia (CAEA):</strong> ARCA no respondía y se emitió con un código de contingencia autorizado de antemano. Es válido; el sistema lo informa a ARCA después.</li>
        <li><strong>Pendiente / reintentando:</strong> ARCA no respondió todavía. El sistema reintenta solo; también podés tocar <strong>Reintentar</strong>.</li>
        <li><strong>Rechazado:</strong> ARCA no lo aceptó (por ejemplo, un dato del cliente). Leé el motivo, corregí y reintentá.</li>
      </ul>
    ),
  },
  {
    id: "arca-caida",
    title: "¿Y si ARCA no responde?",
    body: (
      <>
        <p><strong>La venta nunca se frena.</strong> El cobro queda registrado y el comprobante queda pendiente. El sistema lo reintenta solo (también todas las noches) y, si el comercio tiene contingencia activada, usa CAEA.</p>
        <p>Cuando se autoriza, el ticket fiscal sale por la impresora de caja.</p>
      </>
    ),
  },
  {
    id: "nota-credito",
    title: "Nota de crédito: anular una factura",
    body: (
      <>
        <p>Una factura autorizada <strong>no se borra</strong>: se anula emitiendo una <strong>nota de crédito</strong> por el total. Se usa cuando se devuelve el dinero, se anula la venta o hubo un error en la factura.</p>
        <p>En Facturación elegí la factura y tocá <strong>Nota de crédito</strong>. El cajero necesita el <strong>PIN del encargado</strong>. Una factura solo admite una nota de crédito.</p>
        <p>Si anulás una venta desde Ventas, la nota de crédito se emite sola.</p>
      </>
    ),
  },
  {
    id: "reimprimir",
    title: "Reimprimir un comprobante",
    body: <p>Elegí el comprobante autorizado y tocá <strong>Reimprimir</strong>: sale por la impresora de caja con su QR. Necesita una impresora de caja activa y los datos fiscales del comercio cargados.</p>,
  },
  {
    id: "libro-iva",
    title: "Libro IVA (para el contador)",
    body: (
      <>
        <p>Es el resumen mensual de todas las facturas y notas de crédito autorizadas, con su IVA por alícuota. Lo descargan el <strong>encargado</strong> o el <strong>administrador</strong> desde Facturación:</p>
        <ul>
          <li><strong>CSV:</strong> para revisar en una planilla o pasarle al contador.</li>
          <li><strong>Libro IVA Digital (2 archivos):</strong> comprobantes y alícuotas, en el formato que ARCA pide para importar.</li>
        </ul>
        <p>Las notas de crédito restan. Solo cuentan los comprobantes autorizados.</p>
      </>
    ),
  },
  {
    id: "pruebas",
    title: "Modo pruebas vs. producción",
    body: <p>En <strong>pruebas</strong> (homologación) los comprobantes son de práctica: no tienen validez fiscal y el POS lo marca en pantalla. Cuando el comercio pasa a <strong>producción</strong>, todo lo emitido es real. Los dos ambientes nunca se mezclan.</p>,
  },
  {
    id: "glosario",
    title: "Glosario",
    body: (
      <dl className="fhelp-glossary">
        <dt>ARCA</dt><dd>Agencia de Recaudación y Control Aduanero (ex AFIP).</dd>
        <dt>CUIT</dt><dd>Clave Única de Identificación Tributaria (11 dígitos).</dd>
        <dt>CAE</dt><dd>Código que da ARCA para autorizar cada comprobante.</dd>
        <dt>CAEA</dt><dd>Código de contingencia que se pide por adelantado, para emitir si ARCA no responde.</dd>
        <dt>Punto de venta</dt><dd>Número habilitado en ARCA desde el que se emiten los comprobantes (se ve en el número: 00003-00000015).</dd>
        <dt>Alícuota</dt><dd>Porcentaje de IVA de cada producto (21 %, 10,5 %, etc.).</dd>
        <dt>Nota de crédito</dt><dd>Comprobante que anula total o parcialmente una factura.</dd>
      </dl>
    ),
  },
]

export function FiscalHelpCenter({ onClose, initialTopic }: { onClose: () => void; initialTopic?: string }) {
  const [active, setActive] = useState(initialTopic && TOPICS.some((t) => t.id === initialTopic) ? initialTopic : TOPICS[0].id)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose() } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  const topic = TOPICS.find((t) => t.id === active) ?? TOPICS[0]

  return (
    <div className="customer-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="fhelp-title">
      <div className="customer-modal fhelp">
        <header className="fhelp-head">
          <HelpCircle size={22} aria-hidden />
          <h2 id="fhelp-title">Centro de ayuda — Factura electrónica</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar ayuda"><X size={18} aria-hidden /></button>
        </header>
        <div className="fhelp-body">
          <nav className="fhelp-topics" aria-label="Temas">
            {TOPICS.map((t) => (
              <button key={t.id} type="button" className={`fhelp-topic${t.id === active ? " active" : ""}`} aria-current={t.id === active ? "true" : undefined} onClick={() => setActive(t.id)}>
                {t.title}
              </button>
            ))}
          </nav>
          <article className="fhelp-content" aria-live="polite">
            <h3>{topic.title}</h3>
            {topic.body}
          </article>
        </div>
      </div>
    </div>
  )
}

/** Botón «?» reutilizable (cobro, Facturación). */
export function FiscalHelpButton({ topic, label = "Ayuda" }: { topic?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm fhelp-btn" onClick={() => setOpen(true)} title="Centro de ayuda de factura electrónica">
        <HelpCircle size={16} aria-hidden /> {label}
      </button>
      {open && <FiscalHelpCenter onClose={() => setOpen(false)} initialTopic={topic} />}
    </>
  )
}
