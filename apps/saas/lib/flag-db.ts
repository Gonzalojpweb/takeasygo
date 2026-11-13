import mongoose from 'mongoose'

/**
 * ¿Se puede leer un interruptor de plataforma (PlatformConfig)?
 *
 * Antes, si la base todavía no estaba conectada (instancia de Vercel recién
 * arrancada), los lectores de interruptores respondían «apagado» sin
 * intentar conectar. Las páginas que leen el interruptor ANTES de tocar la
 * base (/grupo/[slug]/personal, /crm, /catalogo…) daban 404 de forma
 * intermitente: en frío «apagado», en caliente «prendido» (13/11/2026).
 *
 * Ahora conecta primero. Si no se puede conectar, devuelve false y quien
 * llama sigue fallando cerrado (sin guardar el valor en caché).
 */
export async function flagDbReady(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) return true
  try {
    const { connectDB } = await import('@/lib/mongoose')
    await connectDB()
  } catch {
    return false
  }
  return mongoose.connection.readyState === 1
}
