import { FONT_ROLES, FONT_INSTANCES } from '@/lib/fonts'

interface FontConfig {
  source: string
  family: string
  weight?: string
  files?: { woff2?: string; woff?: string; ttf?: string }
  adobeFamily?: string
}

interface Props {
  fonts?: {
    heading?: FontConfig
    body?: FontConfig
    display?: FontConfig
    tag?: FontConfig
  }
}

function fontCssVar(role: string): string {
  return `--font-${role}`
}

export default function TenantFontLoader({ fonts }: Props) {
  if (!fonts) return null

  const lines: string[] = []
  const googleFontClasses: string[] = []
  let adobeProjectId: string | null = null

  for (const role of FONT_ROLES) {
    const config = fonts[role.key]
    if (!config) continue

    const varName = fontCssVar(role.key)
    const { source, family, adobeFamily } = config

    if (source === 'google' && family) {
      const instance = FONT_INSTANCES[family]
      if (instance) {
        googleFontClasses.push(instance.className)
        lines.push(`  ${varName}: ${instance.style.fontFamily};`)
      } else {
        lines.push(`  ${varName}: ${family}, sans-serif;`)
      }
    }

    if (source === 'adobe') {
      const resolvedFamily = adobeFamily || family
      if (resolvedFamily) {
        lines.push(`  ${varName}: '${resolvedFamily}', serif;`)
        adobeProjectId = process.env.NEXT_PUBLIC_ADOBE_FONTS_PROJECT_ID || adobeProjectId
      }
    }

    if (source === 'custom') {
      const files = config.files
      if (files?.woff2) {
        const fontFamily = `TenantFont_${role.key}`
        const src = [`url('${files.woff2}') format('woff2')`]
        if (files.woff) src.push(`url('${files.woff}') format('woff')`)
        if (files.ttf) src.push(`url('${files.ttf}') format('truetype')`)
        lines.unshift(
          `@font-face {\n  font-family: '${fontFamily}';\n  src: ${src.join(',\n  ')};\n  font-display: swap;\n}`,
        )
        lines.push(`  ${varName}: '${fontFamily}', sans-serif;`)
      }
    }
  }

  if (lines.length === 0 && !adobeProjectId) return null

  return (
    <>
      {adobeProjectId && (
        <link
          rel="stylesheet"
          href={`https://use.typekit.net/${adobeProjectId}.css`}
        />
      )}
      {googleFontClasses.length > 0 && (
        <div className={googleFontClasses.join(' ')} suppressHydrationWarning aria-hidden="true" />
      )}
      <style>{`:root {\n${lines.join('\n')}\n}`}</style>
    </>
  )
}
