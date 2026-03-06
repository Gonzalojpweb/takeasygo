import Link from 'next/link'
import Image from 'next/image'

const LOGO_URL =
  'https://res.cloudinary.com/dt6iu9m9f/image/upload/v1772059496/logo-removebg-preview_1_yamzfc.png'

interface Props {
  variant?: 'dark' | 'light'
  label?: 'powered' | 'network'
}

/**
 * PoweredByTakeasy — sello de red TakeasyGO.
 * variant='dark'  → para fondos oscuros (menú público)
 * variant='light' → para fondos claros (panel admin)
 */
export default function PoweredByTakeasy({ variant = 'dark', label = 'network' }: Props) {
  const labelText = label === 'powered' ? 'Powered by' : 'Parte de la red'

  const textCls = variant === 'dark'
    ? 'text-slate-400 group-hover:text-slate-200'
    : 'text-muted-foreground group-hover:text-foreground'

  const borderCls = variant === 'dark'
    ? 'border-slate-700 hover:border-orange-500/40'
    : 'border-border/60 hover:border-primary/30'

  return (
    <Link
      href="https://www.takeasygo.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="TakeasyGO — Plataforma de gestión gastronómica"
      className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 hover:shadow-sm ${borderCls}`}
    >
      <span className={`text-xs font-light tracking-wide transition-colors duration-300 ${textCls}`}>
        {labelText}
      </span>
      <Image
        src={LOGO_URL}
        alt="TakeasyGO"
        width={80}
        height={22}
        unoptimized
        className="object-contain opacity-60 group-hover:opacity-100 transition-opacity duration-300"
        style={{ width: 'auto', height: '16px' }}
      />
    </Link>
  )
}
