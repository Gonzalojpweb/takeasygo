type ServiceSlot = { days: number[]; open: string; close: string }

/**
 * Evalúa si un restaurante está abierto ahora según sus serviceHours de takeaway.
 * Retorna null si no hay horarios estructurados configurados.
 */
export function checkIsOpenNow(
  serviceHours?: { takeaway: ServiceSlot[] }
): boolean | null {
  if (!serviceHours?.takeaway?.length) return null
  const now = new Date()
  const day = now.getDay()
  const cur = now.getHours() * 100 + now.getMinutes()
  return serviceHours.takeaway.some(slot => {
    if (!slot.days.includes(day)) return false
    const [oh, om] = slot.open.split(':').map(Number)
    const [ch, cm] = slot.close.split(':').map(Number)
    return cur >= oh * 100 + om && cur <= ch * 100 + cm
  })
}
