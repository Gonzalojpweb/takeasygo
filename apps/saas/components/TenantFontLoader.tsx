import type { ReactNode } from 'react'
import { FONT_ROLES, FONT_INSTANCES, getGoogleFontUrl } from '@/lib/fonts'

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
  children: ReactNode
}

function fontCssVar(role: string): string {
  return `--font-${role}`
}

export default function TenantFontLoader({ fonts, children }: Props) {
  if (!fonts) return <>{children}</>

  const cssVars: Record<string, string> = {}
  const googleFontClasses: string[] = []
  const googleFontUrls: string[] = []
  const customFontFaces: string[] = []
  let adobeProjectId: string | null = null

  for (const role of FONT_ROLES) {
    const config = fonts[role.key]
    if (!config) continue

    const varName = fontCssVar(role.key)
    const { source, family, adobeFamily } = config

    if (source === 'google' && family) {
      const instance = FONT_INSTANCES[family]
      if (instance) {
        if (instance.className) googleFontClasses.push(instance.className)
        cssVars[varName] = instance.style.fontFamily
      } else {
        cssVars[varName] = `'${family}', sans-serif`
      }
      const fontUrl = getGoogleFontUrl(family)
      if (fontUrl && !googleFontUrls.includes(fontUrl)) {
        googleFontUrls.push(fontUrl)
      }
    }

    if (source === 'adobe') {
      const resolvedFamily = adobeFamily || family
      if (resolvedFamily) {
        cssVars[varName] = `'${resolvedFamily}', serif`
        adobeProjectId = process.env.NEXT_PUBLIC_ADOBE_FONTS_PROJECT_ID || adobeProjectId
      }
    }

    if (source === 'custom') {
      const files = config.files
      const hasFont = files?.woff2 || files?.woff || files?.ttf
      if (hasFont) {
        const fontFamily = `TenantFont_${role.key}`
        const src: string[] = []
        if (files.woff2) src.push(`url('${files.woff2}') format('woff2')`)
        if (files.woff) src.push(`url('${files.woff}') format('woff')`)
        if (files.ttf) src.push(`url('${files.ttf}') format('truetype')`)
        customFontFaces.push(
          `@font-face {\n  font-family: '${fontFamily}';\n  src: ${src.join(',\n  ')};\n  font-display: swap;\n}`,
        )
        cssVars[varName] = `'${fontFamily}', sans-serif`
      }
    }
  }

  const hasVars = Object.keys(cssVars).length > 0
  const hasGoogle = googleFontUrls.length > 0
  const hasAdobe = !!adobeProjectId
  const hasCustom = customFontFaces.length > 0

  if (!hasVars && !hasGoogle && !hasAdobe && !hasCustom) return <>{children}</>

  return (
    <>
      {hasGoogle && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {googleFontUrls.map(url => (
            <link key={url} rel="stylesheet" href={url} />
          ))}
        </>
      )}
      {hasAdobe && (
        <link
          rel="stylesheet"
          href={`https://use.typekit.net/${adobeProjectId}.css`}
        />
      )}
      {hasCustom && (
        <style>{customFontFaces.join('\n')}</style>
      )}
      <div
        className={googleFontClasses.join(' ')}
        style={cssVars as React.CSSProperties}
        suppressHydrationWarning
      >
        {children}
      </div>
    </>
  )
}
