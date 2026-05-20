import { FONT_ROLES, getGoogleFontFamily, FONT_MAP } from '@/lib/fonts'

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
  let adobeProjectId: string | null = null

  for (const role of FONT_ROLES) {
    const config = fonts[role.key]
    if (!config) continue

    const varName = fontCssVar(role.key)
    const { source, family, adobeFamily } = config

    if (source === 'google' && family) {
      const cssFamily = getGoogleFontFamily(family) ?? family
      lines.push(`  ${varName}: ${cssFamily};`)
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
      <style>{`:root {\n${lines.join('\n')}\n}`}</style>
    </>
  )
}
