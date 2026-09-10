'use client'

// ── TGO Splash / Onboarding Intro ────────────────────────────────────────────
//
// Splash screen con fondo --tgo-brand, pin blanco invertido y botón "Comenzar".
// SVG inline + CSS keyframes, sin dependencias externas.
//
// Uso:
//   <AnimatedLogoLoader />                                      — loader inline (loading.tsx)
//   <AnimatedLogoLoader interactive onDismiss={fn} />           — splash interactivo (ExploreClient)

import { useCallback, useEffect, useRef, useState } from 'react'

interface AnimatedLogoLoaderProps {
  fullScreen?: boolean
  interactive?: boolean         // true = splash con botón "Comenzar"
  dataReady?: Promise<unknown>  // Promise de las 3 promises del padre
  onReady?: () => void          // se llama cuando la secuencia visual termina (~2.5s)
  onDismiss?: () => void        // se llama cuando el usuario toca "Comenzar"
}

export default function AnimatedLogoLoader({
  fullScreen = true,
  interactive = false,
  dataReady,
  onReady,
  onDismiss,
}: AnimatedLogoLoaderProps) {
  const [playing, setPlaying] = useState(false)
  const [logoSequenceDone, setLogoSequenceDone] = useState(false)
  const [buttonSpinner, setButtonSpinner] = useState(false)
  const dismissCalledRef = useRef(false)

  // ── Start animation on mount ─────────────────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPlaying(true))
    })
  }, [])

  // ── Logo sequence done at ~2.5s ──────────────────────────────────────────
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => {
      setLogoSequenceDone(true)
      onReady?.()
    }, 2500)
    return () => clearTimeout(timer)
  }, [playing, onReady])

  // ── Reduced motion: skip straight to done ────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLogoSequenceDone(true)
      onReady?.()
    }
  }, [onReady])

  // ── Dismiss handler ──────────────────────────────────────────────────────
  const handleDismiss = useCallback(async () => {
    if (dismissCalledRef.current) return
    dismissCalledRef.current = true

    if (!dataReady) {
      // No promise passed — dismiss immediately
      onDismiss?.()
      return
    }

    setButtonSpinner(true)

    // Wait for data or 1.5s safety cap
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500))
    await Promise.race([dataReady, timeout])
    onDismiss?.()
  }, [dataReady, onDismiss])

  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      padding: '60px 40px',
      width: '100%',
      height: '100%',
    }}>
      <style>{`
        .tgo-loader-icon-wrap {
          width: min(60vw, 340px);
          filter: drop-shadow(0 30px 60px rgba(0,0,0,0.18));
        }
        .tgo-loader-icon-wrap svg {
          display: block;
          width: 100%;
          height: auto;
          overflow: visible;
        }

        /* Base states (pre-animation) */
        .tgo-loader .pin-group {
          transform: translateY(-260px) rotate(-9deg) scale(0.85);
          opacity: 0;
          transform-origin: 100px 150px;
        }
        .tgo-loader .shadow {
          opacity: 0;
          transform: scale(0.3);
          transform-origin: 100px 152px;
        }
        .tgo-loader .ring {
          stroke-dasharray: 100 100;
          stroke-dashoffset: 100;
        }
        .tgo-loader .wordmark {
          opacity: 0;
          transform: translateY(8px);
        }
        .tgo-loader .tgo-splash-btn {
          opacity: 0;
          transform: translateY(12px);
        }

        /* Playing state — compressed to ~2.5s */
        .tgo-loader.playing .pin-group {
          animation: tgoPinDrop .8s cubic-bezier(.34,1.45,.55,1) .1s forwards;
        }
        .tgo-loader.playing .shadow {
          animation: tgoShadowGrow .8s ease-out .1s forwards;
        }
        .tgo-loader.playing .ring {
          animation: tgoRingDraw .9s cubic-bezier(.45,.05,.25,1) .9s forwards;
        }
        .tgo-loader.playing .wordmark {
          animation: tgoFadeUp .6s ease-out 1.7s forwards;
        }
        .tgo-loader.playing .tgo-splash-btn {
          animation: tgoBtnEnter .5s ease-out 2.5s forwards;
        }

        @keyframes tgoPinDrop {
          0%   { transform: translateY(-260px) rotate(-9deg) scale(0.85); opacity: 0; }
          55%  { transform: translateY(10px) rotate(2deg) scale(1.05); opacity: 1; }
          72%  { transform: translateY(-8px) rotate(-1deg) scale(0.97); }
          88%  { transform: translateY(3px) rotate(0.5deg) scale(1.01); }
          100% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes tgoShadowGrow {
          0%   { opacity: 0; transform: scale(0.25); }
          55%  { opacity: .08; transform: scale(0.7); }
          72%  { opacity: .18; transform: scale(1.18); }
          100% { opacity: .14; transform: scale(1); }
        }
        @keyframes tgoRingDraw {
          from { stroke-dashoffset: 100; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes tgoFadeUp {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tgoBtnEnter {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .tgo-loader .pin-group,
          .tgo-loader .shadow,
          .tgo-loader .ring,
          .tgo-loader .wordmark,
          .tgo-loader .tgo-splash-btn {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .tgo-loader .ring {
            stroke-dashoffset: 0 !important;
          }
        }

        /* Mobile padding */
        @media (max-width: 480px) {
          .tgo-loader-stage {
            padding: 40px 20px !important;
          }
        }
      `}</style>

      <div className="tgo-loader-icon-wrap">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="tgoBlur6" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* Landing shadow */}
          <ellipse className="shadow" cx="100" cy="152" rx="24" ry="6" fill="#000000" opacity="0.15" />

          {/* Pin — white */}
          <g className="pin-group">
            <path
              d="M100,50 C118.5,50 133,64.5 133,83 C133,108 100,150 100,150 C100,150 67,108 67,83 C67,64.5 81.5,50 100,50 Z"
              fill="#FFFFFF"
            />
            {/* Face — brand color */}
            <circle cx="100" cy="80" r="14" fill="var(--tgo-brand, #F74211)" />
          </g>

          {/* Ring — white, subtle */}
          <path
            className="ring"
            d="M171.8,69.5 A78,78 0 1 1 130.5,28.2"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="9"
            strokeLinecap="round"
            opacity="0.3"
            pathLength="100"
          />
        </svg>
      </div>

      {/* Wordmark */}
      <div className="wordmark" style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: '2.125rem',
          letterSpacing: '2.5px',
          color: '#FFFFFF',
          fontWeight: 700,
        }}>
          TGO
        </div>
        <div style={{
          marginTop: 6,
          fontSize: '0.8125rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.85)',
          fontWeight: 600,
        }}>
          Cerca de vos
        </div>
      </div>

      {/* Comenzar button — only in interactive mode */}
      {interactive && (
        <button
          className="tgo-splash-btn"
          onClick={handleDismiss}
          disabled={buttonSpinner}
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '14px 32px',
            borderRadius: 9999,
            border: 'none',
            background: '#FFFFFF',
            color: 'var(--tgo-brand, #F74211)',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: buttonSpinner ? 'wait' : 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            minWidth: 160,
            minHeight: 48,
          }}
          onMouseEnter={(e) => {
            if (!buttonSpinner) {
              e.currentTarget.style.transform = 'scale(1.02)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          {buttonSpinner ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'tgo-spin .6s linear infinite' }}>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <>Comenzar <span aria-hidden="true">→</span></>
          )}
        </button>
      )}

      <style>{`
        @keyframes tgo-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )

  if (fullScreen) {
    return (
      <div
        className={`tgo-loader ${playing ? 'playing' : ''} tgo-loader-stage`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--tgo-brand, #F74211)',
        }}
      >
        {content}
      </div>
    )
  }

  return (
    <div
      className={`tgo-loader ${playing ? 'playing' : ''} tgo-loader-stage`}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--tgo-brand, #F74211)',
      }}
    >
      {content}
    </div>
  )
}
