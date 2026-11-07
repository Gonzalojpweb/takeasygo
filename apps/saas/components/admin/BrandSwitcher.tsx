'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, ArrowLeftRight } from 'lucide-react'

// Selector de marca (multi-marca, diseño 1-e): para quien opera varias marcas
// de una organización, saltar de una a otra sin volver a /grupo. La lista la
// arma el servidor con las membresías; cada panel vuelve a validar el acceso.

export default function BrandSwitcher({
  current, currentName, brands,
}: {
  current: string
  currentName: string
  brands: { slug: string; name: string; orgName: string }[]
}) {
  const router = useRouter()
  const options = brands.some(b => b.slug === current) ? brands : [{ slug: current, name: currentName, orgName: 'Tu comercio' }, ...brands]
  const orgs = [...new Set(options.map(b => b.orgName))]

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      <ArrowLeftRight size={13} className="shrink-0" />
      <label htmlFor="brand-switcher" className="sr-only">Cambiar de marca</label>
      <select
        id="brand-switcher"
        value={current}
        onChange={e => { if (e.target.value !== current) router.push(`/${e.target.value}/admin`) }}
        className="min-w-0 max-w-[60vw] truncate rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground"
      >
        {orgs.length > 1
          ? orgs.map(org => (
              <optgroup key={org} label={org}>
                {options.filter(b => b.orgName === org).map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
              </optgroup>
            ))
          : options.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
      </select>
      {orgs.length === 1 && <span className="hidden sm:inline truncate">{orgs[0]}</span>}
      <Link href="/grupo" className="ml-auto inline-flex items-center gap-1 hover:text-foreground shrink-0">
        <Building2 size={13} /> Mis organizaciones
      </Link>
    </div>
  )
}
