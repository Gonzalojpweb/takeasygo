'use client'

import { useState, useEffect } from 'react'

interface ReviewItem {
  type: 'rating' | 'feedback'
  stars?: number
  satisfaction?: string
  comment: string
  tenantSlug: string
  tenantName: string
  createdAt: string
}

interface ReviewStats {
  totalRatings: number
  averageStars: number | null
  totalFeedback: number
  satisfactionRate: number | null
  excellentRate: number | null
  totalTenants: number
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? '#F74211' : 'none'} stroke="#F74211" strokeWidth="2">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function SatisfactionBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    excelente: { label: 'Excelente', color: '#2FBF71', bg: 'rgba(47,191,113,0.12)' },
    buena: { label: 'Buena', color: '#FAB300', bg: 'rgba(250,179,0,0.12)' },
    mejorable: { label: 'Mejorable', color: '#F74211', bg: 'rgba(247,66,17,0.12)' },
  }
  const c = config[level] || config.buena
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        padding: '3px 8px',
        borderRadius: 4,
        letterSpacing: '0.02em',
      }}
    >
      {c.label}
    </span>
  )
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const initials = item.tenantName
    ? item.tenantName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  return (
    <div
      style={{
        background: 'var(--tgo-paper)',
        border: '1px solid var(--tgo-line-on-paper)',
        borderRadius: 12,
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header: stars or satisfaction + tenant */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {item.type === 'rating' && item.stars ? (
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <StarIcon key={s} filled={s <= item.stars!} />
            ))}
          </div>
        ) : item.satisfaction ? (
          <SatisfactionBadge level={item.satisfaction} />
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: 'var(--tgo-ink)',
              color: 'var(--tgo-text-on-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              fontWeight: 700,
              fontFamily: 'var(--font-big-shoulders), sans-serif',
            }}
          >
            {initials}
          </div>
          <span
            style={{
              fontSize: 11,
              color: 'var(--tgo-text-on-paper-soft)',
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.tenantSlug}
          </span>
        </div>
      </div>

      {/* Comment */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--tgo-text-on-paper)',
          flex: 1,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        &ldquo;{item.comment}&rdquo;
      </p>

      {/* Timestamp */}
      <div style={{ fontSize: 10, color: 'var(--tgo-text-on-paper-soft)' }}>
        {new Date(item.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
      </div>
    </div>
  )
}

export default function Testimonios() {
  const [feed, setFeed] = useState<ReviewItem[]>([])
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tgo/reviews')
      .then((r) => r.json())
      .then((data) => {
        setFeed(data.feed || [])
        setStats(data.stats || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading || feed.length === 0) return null

  return (
    <section style={{ padding: '0 0 88px' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 28px' }}>
        {/* Stats bar */}
        {stats && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 32,
              flexWrap: 'wrap',
              marginBottom: 40,
              padding: '18px 24px',
              background: 'var(--tgo-ink)',
              borderRadius: 12,
              color: 'var(--tgo-text-on-ink)',
            }}
          >
            {stats.averageStars !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#F74211" stroke="#F74211" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', fontSize: 15, fontWeight: 600 }}>
                  {stats.averageStars}
                </span>
                <span style={{ fontSize: 12, color: 'var(--tgo-text-on-ink-soft)' }}>
                  de 5 · {stats.totalRatings} reseñas
                </span>
              </div>
            )}
            {stats.satisfactionRate !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#2FBF71',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace', fontSize: 15, fontWeight: 600 }}>
                  {stats.satisfactionRate}%
                </span>
                <span style={{ fontSize: 12, color: 'var(--tgo-text-on-ink-soft)' }}>
                  dijo excelente
                </span>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--tgo-text-on-ink-soft)' }}>
              {stats.totalTenants}+ locales en la red
            </div>
          </div>
        )}

        {/* Reviews grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
          className="tgo-reviews-grid"
        >
          {feed.slice(0, 9).map((item, i) => (
            <ReviewCard key={`${item.type}-${i}`} item={item} />
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .tgo-reviews-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 520px) {
          .tgo-reviews-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
