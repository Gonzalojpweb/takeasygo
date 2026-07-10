import { getNowInTimezone, getLocalDayAndMinutes } from './lib/restaurant-time.ts'

const tz = 'America/Argentina/Buenos_Aires'

const now = getNowInTimezone(tz)
console.log('getNowInTimezone result:', now)

const d = new Date()
console.log('Current UTC:', d.toISOString())
console.log('Current local hour:', d.getHours(), 'min:', d.getMinutes(), 'day:', d.getDay())
console.log('Current local time in minutes:', d.getHours() * 60 + d.getMinutes())

// Test a slot that should be open
const slotOpen = 20 * 60  // 20:00
const slotClose = 23 * 60 + 59  // 23:59
const isCurrentlyOpen = now.minutes >= slotOpen && now.minutes <= slotClose
console.log(`Slot 20:00-23:59, currently local minutes: ${now.minutes}, isOpen: ${isCurrentlyOpen}`)
