// ============================================================================
// Tipografías de la landing — alojadas en el propio sitio (next/font)
// ============================================================================
// Antes se cargaban con @import desde fonts.googleapis.com y la política de
// seguridad (CSP: style-src) las bloqueaba: la web se veía con la fuente de
// respaldo. next/font las descarga al compilar y las sirve desde el dominio.
// ============================================================================

import { DM_Sans, DM_Serif_Display } from 'next/font/google'

export const tgoSerif = DM_Serif_Display({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-tgo-serif',
  display: 'swap',
})

export const tgoSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-tgo-sans',
  display: 'swap',
})

/** Clases que definen las variables --font-tgo-*. Van en la raíz de la landing y en los modales (portal). */
export const fontVars = `${tgoSerif.variable} ${tgoSans.variable}`
