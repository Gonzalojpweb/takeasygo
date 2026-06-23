import { NextResponse } from 'next/server'

const AGENT_VERSION = '1.0.0'
const DOWNLOAD_URL = 'https://github.com/your-org/takeasygo-releases/releases/latest/download/printer-agent'

/**
 * GET /api/agent/version
 * Endpoint público (sin auth) que devuelve la versión actual del agente
 * y la URL de descarga del binario actualizado.
 *
 * El agente local consulta este endpoint al arrancar para comparar versiones.
 */
export async function GET() {
  return NextResponse.json({
    version: AGENT_VERSION,
    downloadUrl: DOWNLOAD_URL,
  })
}
