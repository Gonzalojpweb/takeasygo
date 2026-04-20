'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Moon, Sun, Settings, MapPin, Phone, Clock, Instagram, Facebook, Twitter } from 'lucide-react'
import { isAvailableNow } from '@/lib/availability'
import { PromotionCard, PromotionCarousel } from '@/components/menu/PromotionCard'

interface Props {
  tenant: any
  location: any
  menu: any
}

const VEGETARIAN_TAGS = ['vegetariano', 'vegano', 'vegan', 'vegetarian']

function isVegetarian(tags: string[]): boolean {
  return tags.some(t => VEGETARIAN_TAGS.includes(t.toLowerCase()))
}

function tn(obj: any, field: 'name' | 'description', locale: 'es' | 'en'): string {
  if (locale === 'en') {
    const trans = field === 'name' ? obj.nameTranslations : obj.descriptionTranslations
    if (trans?.en) return trans.en
  }
  return obj[field] || ''
}

function hasMissingTranslations(categories: any[]): boolean {
  for (const cat of categories) {
    if (!cat.nameTranslations?.en) return true
    for (const item of cat.items ?? []) {
      if (!item.nameTranslations?.en) return true
    }
  }
  return false
}

const UI = {
  es: {
    featuredTitle: 'Platos Destacados',
    featuredSubtitle: 'Una selección de nuestras creaciones más aclamadas, donde la técnica se encuentra con la pasión',
    contact: 'Contacto',
    ourStory: 'Nuestra Historia',
    followUs: 'Síguenos',
    followIG: 'Seguinos en Instagram',
    followFB: 'Seguinos en Facebook',
    followTW: 'Seguinos en Twitter',
    rights: 'Todos los derechos reservados.',
    terms: 'Términos y Condiciones',
    privacy: 'Política de Privacidad',
    translating: 'Traduciendo...',
  },
  en: {
    featuredTitle: 'Featured Dishes',
    featuredSubtitle: 'A selection of our most acclaimed creations, where technique meets passion',
    contact: 'Contact',
    ourStory: 'Our Story',
    followUs: 'Follow us',
    followIG: 'Follow us on Instagram',
    followFB: 'Follow us on Facebook',
    followTW: 'Follow us on Twitter',
    rights: 'All rights reserved.',
    terms: 'Terms & Conditions',
    privacy: 'Privacy Policy',
    translating: 'Translating...',
  },
}

export default function DineInMenuView({ tenant, location, menu }: Props) {
  const branding = tenant.branding
  const profile = tenant.profile ?? {}

  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [dark, setDark] = useState(false)
  const [locale, setLocale] = useState<'es' | 'en'>('es')
  const [translating, setTranslating] = useState(false)
  const [menuData, setMenuData] = useState(menu)
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [modalItem, setModalItem] = useState<any | null>(null)
  const [promotions, setPromotions] = useState<any[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(true)
  const [showCartPopup, setShowCartPopup] = useState(false)

  useEffect(() => {
    fetch(`/api/${tenant.slug}/menu/${location._id}/promotions?mode=dine-in`)
      .then(r => r.ok ? r.json() : { promotions: [] })
      .then(data => {
        setPromotions(data.promotions || [])
        setPromotionsLoading(false)
      })
      .catch(() => setPromotionsLoading(false))
  }, [tenant.slug, location._id])

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)

  const t = UI[locale]

  const categories = (menuData.categories ?? [])
    .filter((c: any) => c.isAvailable && (!mounted || isAvailableNow(c.availabilityMode, c.availabilitySchedule)))
    .sort((a: any, b: any) => {
      const diff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      return diff !== 0 ? diff : String(a._id).localeCompare(String(b._id))
    })

  const featuredItems = categories
    .flatMap((c: any) => c.items ?? [])
    .filter((i: any) => i.isFeatured)

  async function switchToEnglish() {
    if (categories.length > 0 && hasMissingTranslations(categories)) {
      setTranslating(true)
      try {
        const res = await fetch(`/api/${tenant.slug}/menu/translate-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: location._id }),
        })
        if (res.ok) {
          const data = await res.json()
          setMenuData(data.menu)
        }
      } catch {
        // fallback to Spanish if translation fails
      } finally {
        setTranslating(false)
      }
    }
    setLocale('en')
  }

  function handleLocaleToggle(newLocale: 'es' | 'en') {
    if (newLocale === 'en') {
      switchToEnglish()
    } else {
      setLocale('es')
    }
  }

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
  }, [menuData])

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

  const hasHeroMedia = location.hero?.mediaType !== 'none' && !!location.hero?.url
  const showLogoOnHero = location.hero?.showLogo !== false

  return (
    <div style={{ backgroundColor: bg, color: text, minHeight: '100vh', fontFamily: 'Georgia, serif' }}>

      {/* ── Translating overlay ── */}
      {translating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl font-semibold text-sm text-white"
            style={{ backgroundColor: branding.primaryColor }}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {t.translating}
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="relative text-center overflow-hidden flex items-center justify-center"
        style={{
          minHeight: hasHeroMedia ? '40vh' : undefined,
          paddingTop: hasHeroMedia ? 0 : '4rem',
          paddingBottom: hasHeroMedia ? 0 : '4rem',
          backgroundColor: bg,
        }}
      >
        {hasHeroMedia && location.hero.mediaType === 'image' && (
          <img src={location.hero.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {hasHeroMedia && location.hero.mediaType === 'video' && (
          <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
            <source src={location.hero.url} type="video/mp4" />
          </video>
        )}
        {hasHeroMedia && (
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.65) 100%)' }} />
        )}

        <div className="relative z-10 px-4 py-16 w-full flex flex-col items-center">
          {showLogoOnHero && branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={tenant.name}
              className="h-20 object-contain mx-auto mb-6"
              style={{ filter: hasHeroMedia ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' : undefined }}
            />
          ) : !branding.logoUrl && !hasHeroMedia ? (
            <h1 className="text-4xl font-bold mb-2" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
              {tenant.name}
            </h1>
          ) : null}

          <h2 className="text-2xl font-bold mb-3"
            style={{ color: hasHeroMedia ? '#ffffff' : branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
            Menu
          </h2>

          {profile.menuDescription && (
            <p className="max-w-2xl mx-auto text-base leading-relaxed mb-4"
              style={{ color: hasHeroMedia ? 'rgba(255,255,255,0.78)' : mutedText, fontFamily: 'Georgia, Cambria, serif', fontStyle: 'italic' }}>
              {profile.menuDescription}
            </p>
          )}
        </div>

        {hasHeroMedia && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center" style={{ animation: 'bounce 2s infinite' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <svg width="28" height="20" viewBox="0 0 24 16" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: -10 }}>
              <polyline points="6 1 12 7 18 1" />
            </svg>
          </div>
        )}
        <style>{`@keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(6px)} }`}</style>
      </section>

      {/* ── Sticky category nav ───────────────────────────── */}
      <div
        className="sticky top-0 z-50 border-b"
        style={{ backgroundColor: navBg + 'f2', borderColor: navBorder, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-2 px-3 py-2.5">
          <div
            ref={navRef}
            className="flex-1 flex items-center gap-2 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {categories.map((cat: any) => {
              const isActive = activeCategory === cat._id
              return (
                <button
                  key={cat._id}
                  data-cat={cat._id}
                  onClick={() => scrollToCategory(cat._id)}
                  className="whitespace-nowrap flex-shrink-0 transition-all"
                  style={{
                    padding: '5px 14px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderRadius: '9999px',
                    border: `1.5px solid ${branding.primaryColor}`,
                    backgroundColor: isActive ? branding.primaryColor : 'transparent',
                    color: isActive ? '#ffffff' : branding.primaryColor,
                    cursor: 'pointer',
                  }}>
                  {tn(cat, 'name', locale)}
                </button>
              )
            })}
          </div>

          {/* Language toggle — right next to dark mode */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => handleLocaleToggle('es')}
              className="px-1.5 py-1 rounded transition-opacity"
              style={{
                fontSize: '11px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer',
                color: branding.primaryColor, opacity: locale === 'es' ? 1 : 0.35,
              }}>
              ES
            </button>
            <span style={{ opacity: 0.25, color: text, fontSize: '11px' }}>|</span>
            <button
              onClick={() => handleLocaleToggle('en')}
              className="px-1.5 py-1 rounded transition-opacity"
              style={{
                fontSize: '11px', fontWeight: 700, border: 'none', background: 'none', cursor: 'pointer',
                color: branding.primaryColor, opacity: locale === 'en' ? 1 : 0.35,
              }}>
              EN
            </button>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            className="p-2 rounded-full transition-colors flex-shrink-0"
            style={{ color: mutedText, border: `1.5px solid ${branding.primaryColor}40` }}>
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
</div>

        {/* Promotions Section */}
        {promotions.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span style={{ color: text, fontWeight: 700, fontSize: '17px' }}>🏷️</span>
              <p style={{ color: text, fontWeight: 700, fontSize: '17px' }}>Promociones</p>
            </div>
            <PromotionCarousel 
              promotions={promotions}
              primary={branding.primaryColor}
            />
          </section>
        )}

      </div>
      {/* ── Menu sections ─────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {categories.map((cat: any) => (
          <section
            key={cat._id}
            ref={el => { sectionRefs.current[cat._id] = el }}
            className="mb-12 scroll-mt-20">
            <div className="text-center mb-8">
              <h3 className="text-3xl font-bold mb-2" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
                {tn(cat, 'name', locale)}
              </h3>
              <div className="flex items-center justify-center gap-3">
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: branding.primaryColor + '80' }} />
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
              </div>
            </div>

            <div className="space-y-3">
              {(cat.items ?? [])
                .filter((i: any) => i.isAvailable && (!mounted || isAvailableNow(i.availabilityMode, i.availabilitySchedule)))
                .map((item: any) => (
                  <div
                    key={item._id}
                    className="flex items-start gap-3 rounded-xl border transition-all overflow-hidden"
                    style={{ backgroundColor: cardBg, borderColor: cardBorder }}
                    onClick={() => item.imageUrl && setModalItem(item)}
                  >
                    {item.imageUrl ? (
                      <div className="flex-shrink-0 w-[88px] h-[88px] relative" style={{ cursor: 'pointer' }}>
                        <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-3 self-stretch" style={{ backgroundColor: branding.primaryColor + '18' }} />
                    )}

                    <div className="flex-1 min-w-0 py-3 pr-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm tracking-wide" style={{ color: text }}>
                          {tn(item, 'name', locale)}
                        </p>
                        <p className="font-bold text-sm flex-shrink-0" style={{ color: branding.primaryColor }}>
                          ${item.price.toLocaleString('es-AR')}
                        </p>
                      </div>
                      {item.description && (
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: mutedText }}>
                          {tn(item, 'description', locale)}
                        </p>
                      )}
                      {item.tags?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {item.tags.map((tag: string) => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full border"
                              style={{ borderColor: branding.primaryColor + '50', color: branding.primaryColor }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── Platos Destacados ──────────────────────────────── */}
      {featuredItems.length > 0 && (
        <section className="py-16 px-4" style={{ backgroundColor: dark ? '#020617' : '#1e293b' }}>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h3 className="text-3xl font-bold mb-3" style={{ color: branding.primaryColor, fontFamily: 'Georgia, Cambria, serif' }}>
                {t.featuredTitle}
              </h3>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
                <div className="h-px w-12" style={{ backgroundColor: branding.primaryColor + '50' }} />
              </div>
              <p className="text-sm max-w-sm mx-auto" style={{ color: '#94a3b8' }}>
                {t.featuredSubtitle}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredItems.slice(0, 8).map((item: any) => (
                <button key={item._id} onClick={() => setModalItem(item)} className="rounded-xl overflow-hidden aspect-square relative group">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={tn(item, 'name', locale)} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3"
                      style={{ backgroundColor: branding.primaryColor + '20', border: `1px solid ${branding.primaryColor}30` }}>
                      <p className="text-xs font-bold text-center leading-tight" style={{ color: branding.primaryColor }}>
                        {tn(item, 'name', locale)}
                      </p>
                      <p className="text-xs font-bold" style={{ color: branding.primaryColor }}>
                        ${item.price.toLocaleString('es-AR')}
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                    <p className="text-white text-xs font-bold text-left">{tn(item, 'name', locale)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{ backgroundColor: dark ? '#020617' : '#1e293b' }}>
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-bold text-base mb-4" style={{ color: branding.primaryColor }}>{t.contact}</h4>
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
            {profile.about && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: branding.primaryColor }}>{t.ourStory}</h4>
                <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{profile.about}</p>
              </div>
            )}
            {(profile.social?.instagram || profile.social?.facebook || profile.social?.twitter) && (
              <div>
                <h4 className="font-bold text-base mb-4" style={{ color: branding.primaryColor }}>{t.followUs}</h4>
                <div className="space-y-3">
                  {profile.social?.instagram && (
                    <a href={`https://instagram.com/${profile.social.instagram.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: branding.primaryColor }}>
                        <Instagram size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: branding.primaryColor }}>{t.followIG}</p>
                      </div>
                    </a>
                  )}
                  {profile.social?.facebook && (
                    <a href={`https://facebook.com/${profile.social.facebook.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: branding.primaryColor }}>
                        <Facebook size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: branding.primaryColor }}>{t.followFB}</p>
                      </div>
                    </a>
                  )}
                  {profile.social?.twitter && (
                    <a href={`https://twitter.com/${profile.social.twitter.replace('@', '')}`}
                      target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: branding.primaryColor }}>
                        <Twitter size={18} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{tenant.name}</p>
                        <p className="text-xs" style={{ color: branding.primaryColor }}>{t.followTW}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-4 py-4 max-w-4xl mx-auto flex items-center justify-between"
          style={{ borderColor: branding.primaryColor + '20' }}>
          <p className="text-xs" style={{ color: '#475569' }}>
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> {tenant.name}. {t.rights}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: '#334155' }}>{t.terms}</span>
            <span className="text-xs" style={{ color: '#334155' }}>{t.privacy}</span>
            <Link href={`/${tenant.slug}/admin`} className="opacity-20 hover:opacity-60 transition-opacity" title="Acceso administrador">
              <Settings size={14} style={{ color: '#94a3b8' }} />
            </Link>
          </div>
        </div>
      </footer>

      {/* ── Image modal ───────────────────────────────────── */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setModalItem(null)}>
          <div className="max-w-sm w-full rounded-2xl overflow-hidden"
            style={{ backgroundColor: cardBg }}
            onClick={e => e.stopPropagation()}>
            {modalItem.imageUrl && (
              <img src={modalItem.imageUrl} alt={tn(modalItem, 'name', locale)} className="w-full aspect-square object-cover" />
            )}
            <div className="p-4">
              <p className="font-bold uppercase tracking-wide" style={{ color: text }}>{tn(modalItem, 'name', locale)}</p>
              {modalItem.description && (
                <p className="text-sm mt-1" style={{ color: mutedText }}>{tn(modalItem, 'description', locale)}</p>
              )}
              <p className="font-bold text-lg mt-2" style={{ color: branding.primaryColor }}>
                ${modalItem.price.toLocaleString('es-AR')}
              </p>
              {modalItem.tags?.length > 0 && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {modalItem.tags.map((tag: string) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ borderColor: branding.primaryColor + '50', color: branding.primaryColor }}>
                      {tag}
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
