'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Moon, Sun, Settings, MapPin, Phone, Clock, Instagram, Facebook, Twitter, Eye } from 'lucide-react'

interface Props {
  tenant: any
  location: any
  menu: any
}

const VEGETARIAN_TAGS = ['vegetariano', 'vegano', 'vegan', 'vegetarian']

function isVegetarian(tags: string[]): boolean {
  return tags.some(t => VEGETARIAN_TAGS.includes(t.toLowerCase()))
}

function DietaryIcon({ tags, color }: { tags: string[]; color: string }) {
  if (isVegetarian(tags)) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}>
        <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2C14 3 12 2 10 2 7 2 3 4 3 9c0 2 1 4 2 5" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" style={{ flexShrink: 0 }}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  )
}

export default function DineInMenuView({ tenant, location, menu }: Props) {
  const branding = tenant.branding
  const profile = tenant.profile ?? {}

  const [dark, setDark] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [modalItem, setModalItem] = useState<any | null>(null)

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)

  const categories = (menu.categories ?? [])
    .filter((c: any) => c.isAvailable)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

  const featuredItems = categories
    .flatMap((c: any) => c.items ?? [])
    .filter((i: any) => i.isFeatured && i.imageUrl)

  // Detect which section is visible
  useEffect(() => {
    if (categories.length === 0) return
    setActiveCategory(categories[0]._id)

    const observers: IntersectionObserver[] = []
    categories.forEach((cat: any) => {
      const el = sectionRefs.current[cat._id]
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveCategory(cat._id) },
        { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [menu])

  function scrollToCategory(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollNavToActive(id: string) {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector(`[data-cat="${id}"]`) as HTMLElement
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  useEffect(() => { scrollNavToActive(activeCategory) }, [activeCategory])

  // Colors that switch with dark mode
  const bg = dark ? '#0f172a' : branding.backgroundColor
  const text = dark ? '#e2e8f0' : branding.textColor
  const cardBg = dark ? '#1e293b' : '#ffffff'
  const cardBorder = dark ? branding.primaryColor + '25' : branding.primaryColor + '20'
  const mutedText = dark ? '#94a3b8' : text + '99'
  const navBg = dark ? '#0f172a' : branding.backgroundColor
  const navBorder = dark ? branding.primaryColor + '30' : branding.primaryColor + '20'

  return (
    <div style={{ backgroundColor: bg, color: text, minHeight: '100vh', fontFamily: 'Georgia, serif' }}>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="text-center py-16 px-4" style={{ backgroundColor: bg }}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={tenant.name} className="h-20 object-contain mx-auto mb-6" />
        ) : (
          <h1 className="text-4xl font-bold mb-2" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
            {tenant.name}
          </h1>
        )}
        <h2 className="text-2xl font-bold mb-3" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
          Nuestra Carta
        </h2>
        {/* Decorative line */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-px w-16" style={{ backgroundColor: branding.primaryColor + '60' }} />
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
          <div className="h-px w-16" style={{ backgroundColor: branding.primaryColor + '60' }} />
        </div>
        {profile.menuDescription && (
          <p className="max-w-2xl mx-auto text-base leading-relaxed" style={{ color: mutedText, fontFamily: 'Georgia, Cambria, serif', fontStyle: 'italic' }}>
            {profile.menuDescription}
          </p>
        )}
      </section>

      {/* ── Sticky category nav ────────────────────────────────── */}
      <div
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: navBg + 'f0', borderColor: navBorder, backdropFilter: 'blur(12px)' }}>
        <div className="max-w-4xl mx-auto flex items-center">
          <div
            ref={navRef}
            className="flex-1 flex items-center overflow-x-auto scrollbar-none"
            style={{ scrollbarWidth: 'none' }}>
            {categories.map((cat: any) => {
              const isActive = activeCategory === cat._id
              return (
                <button
                  key={cat._id}
                  data-cat={cat._id}
                  onClick={() => scrollToCategory(cat._id)}
                  className="whitespace-nowrap px-4 py-4 text-sm font-medium transition-colors relative"
                  style={{
                    color: isActive ? branding.primaryColor : mutedText,
                    borderBottom: isActive ? `2px solid ${branding.primaryColor}` : '2px solid transparent',
                    marginBottom: '-1px',
                  }}>
                  {cat.name}
                </button>
              )
            })}
          </div>
          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            className="p-3 ml-2 rounded-lg transition-colors flex-shrink-0"
            style={{ color: mutedText }}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>

      {/* ── Menu sections ──────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {categories.map((cat: any) => (
          <section
            key={cat._id}
            ref={el => { sectionRefs.current[cat._id] = el }}
            className="mb-12 scroll-mt-20">
            {/* Category header */}
            <div className="text-center mb-8">
              <h3 className="text-3xl font-bold mb-2" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
                {cat.name}
              </h3>
              <div className="flex items-center justify-center gap-3">
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: branding.primaryColor + '80' }} />
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              {(cat.items ?? [])
                .filter((i: any) => i.isAvailable)
                .map((item: any) => (
                  <div
                    key={item._id}
                    className="flex items-start gap-4 p-4 rounded-xl border transition-all"
                    style={{ backgroundColor: cardBg, borderColor: cardBorder }}>
                    {/* Dietary icon */}
                    <div className="mt-0.5">
                      <DietaryIcon tags={item.tags ?? []} color={branding.primaryColor + '80'} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm tracking-wide uppercase" style={{ color: text }}>
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: mutedText }}>
                          {item.description}
                        </p>
                      )}
                      {item.tags?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {item.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="text-xs px-2 py-0.5 rounded-full border"
                              style={{ borderColor: branding.primaryColor + '50', color: branding.primaryColor }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Price + eye */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.imageUrl && (
                        <button
                          onClick={() => setModalItem(item)}
                          className="opacity-50 hover:opacity-100 transition-opacity">
                          <Eye size={16} style={{ color: branding.primaryColor }} />
                        </button>
                      )}
                      <p className="font-bold text-base" style={{ color: branding.primaryColor }}>
                        ${item.price.toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── Platos Destacados ─────────────────────────────────── */}
      {featuredItems.length > 0 && (
        <section className="py-16 px-4" style={{ backgroundColor: dark ? '#020617' : '#1e293b' }}>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
                Platos Destacados
              </h3>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
              </div>
              <p className="text-sm" style={{ color: '#94a3b8' }}>
                Una selección de nuestras creaciones más aclamadas
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredItems.slice(0, 8).map((item: any) => (
                <button
                  key={item._id}
                  onClick={() => setModalItem(item)}
                  className="rounded-xl overflow-hidden aspect-square relative group">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <p className="text-white text-xs font-bold text-left">{item.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: dark ? '#020617' : '#1e293b' }}>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* Contacto */}
            <div>
              <h4 className="font-bold text-base mb-4" style={{ color: branding.primaryColor }}>
                Contacto
              </h4>
              <div className="space-y-3">
                {location.address && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} style={{ color: branding.primaryColor, marginTop: 2, flexShrink: 0 }} />
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{location.address}</p>
                  </div>
                )}
                {location.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} style={{ color: branding.primaryColor, flexShrink: 0 }} />
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{location.phone}</p>
                  </div>
                )}
                {location.hours && (
                  <div className="flex items-center gap-2">
                    <Clock size={14} style={{ color: branding.primaryColor, flexShrink: 0 }} />
                    <p className="text-sm" style={{ color: '#94a3b8' }}>{location.hours}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Historia */}
            {profile.about && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: branding.primaryColor }}>
                  Nuestra Historia
                </h4>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                  {profile.about}
                </p>
              </div>
            )}

            {/* Redes */}
            {(profile.social?.instagram || profile.social?.facebook || profile.social?.twitter) && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: branding.primaryColor }}>
                  Síguenos
                </h4>
                <div className="space-y-3">
                  {profile.social?.instagram && (
                    <a href={`https://instagram.com/${profile.social.instagram.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: branding.primaryColor }}>
                        <Instagram size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: branding.primaryColor }}>Seguinos en Instagram</p>
                      </div>
                    </a>
                  )}
                  {profile.social?.facebook && (
                    <a href={`https://facebook.com/${profile.social.facebook.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: branding.primaryColor }}>
                        <Facebook size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: branding.primaryColor }}>Seguinos en Facebook</p>
                      </div>
                    </a>
                  )}
                  {profile.social?.twitter && (
                    <a href={`https://twitter.com/${profile.social.twitter.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: branding.primaryColor }}>
                        <Twitter size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: branding.primaryColor }}>Seguinos en Twitter</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t px-4 py-4 max-w-4xl mx-auto flex items-center justify-between"
          style={{ borderColor: branding.primaryColor + '20' }}>
          <p className="text-xs" style={{ color: '#475569' }}>
            © {new Date().getFullYear()} {tenant.name}. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: '#334155' }}>Términos y Condiciones</span>
            <span className="text-xs" style={{ color: '#334155' }}>Política de Privacidad</span>
            {/* Discrete admin access */}
            <Link
              href={`/${tenant.slug}/admin`}
              className="opacity-20 hover:opacity-60 transition-opacity"
              title="Acceso administrador">
              <Settings size={14} style={{ color: '#94a3b8' }} />
            </Link>
          </div>
        </div>
      </footer>

      {/* ── Image modal ───────────────────────────────────────── */}
      {modalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setModalItem(null)}>
          <div
            className="max-w-sm w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: cardBg }}
            onClick={e => e.stopPropagation()}>
            {modalItem.imageUrl && (
              <img src={modalItem.imageUrl} alt={modalItem.name} className="w-full aspect-square object-cover" />
            )}
            <div className="p-4">
              <p className="font-bold uppercase tracking-wide" style={{ color: text }}>{modalItem.name}</p>
              {modalItem.description && (
                <p className="text-sm mt-1" style={{ color: mutedText }}>{modalItem.description}</p>
              )}
              <p className="font-bold text-lg mt-2" style={{ color: branding.primaryColor }}>
                ${modalItem.price.toLocaleString('es-AR')}
              </p>
              {modalItem.tags?.length > 0 && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {modalItem.tags.map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ borderColor: branding.primaryColor + '50', color: branding.primaryColor }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
