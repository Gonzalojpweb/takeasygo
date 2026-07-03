import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { publishPairingCode } from "../services/pairing-hub"

interface PairingQRProps {
  tenantId: string
  hubId: string
  jwt: string
  onPairingPublished?: (code: string, expiresAt: number) => void
}

export function PairingQR({ tenantId, hubId, jwt, onPairingPublished }: PairingQRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [qrNonce, setQrNonce] = useState<string | null>(null)

  useEffect(() => {
    if (!code || !qrNonce || !canvasRef.current) return

    const qrData = JSON.stringify({
      code,
      nonce: qrNonce,
      hubId,
      tenantId,
    })

    QRCode.toCanvas(canvasRef.current, qrData, {
      width: 256,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }).catch((err) => {
      console.error("[PairingQR] QR generation error:", err)
    })
  }, [code, qrNonce, hubId, tenantId])

  async function handleGenerate() {
    setLoading(true)
    setError(null)

    try {
      const nonce = crypto.randomUUID()
      const result = await publishPairingCode(
        hubId,
        nonce,
        window.location.hostname,
        5173,
        "",
        jwt
      )

      setCode(result.code)
      setQrNonce(nonce)
      setExpiresAt(result.expiresAt)
      onPairingPublished?.(result.code, result.expiresAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generating pairing code")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <h2 style={{ color: "#fff", fontFamily: "system-ui, sans-serif", marginBottom: "1rem" }}>
        Vincular dispositivo
      </h2>

      {!code && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: loading ? "#555" : "#22c55e",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          {loading ? "Generando..." : "Generar código QR"}
        </button>
      )}

      {error && (
        <p style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>
      )}

      {code && (
        <div style={{ marginTop: "1.5rem" }}>
          <canvas ref={canvasRef} style={{ borderRadius: "8px" }} />

          <div style={{ marginTop: "1rem" }}>
            <p style={{ color: "#888", fontSize: "0.875rem", fontFamily: "system-ui, sans-serif" }}>
              Código de respaldo (si no podés escanear):
            </p>
            <p style={{
              color: "#fff",
              fontSize: "2rem",
              fontWeight: 700,
              letterSpacing: "0.25em",
              fontFamily: "monospace",
              marginTop: "0.5rem",
            }}>
              {code}
            </p>
          </div>

          {expiresAt && (
            <p style={{ color: "#888", fontSize: "0.75rem", marginTop: "1rem", fontFamily: "system-ui, sans-serif" }}>
              Expira en {Math.max(0, Math.floor((expiresAt - Date.now() / 1000) / 60))} minutos
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              backgroundColor: "transparent",
              color: "#888",
              border: "1px solid #333",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Regenerar código
          </button>
        </div>
      )}
    </div>
  )
}
