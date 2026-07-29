'use client'

// ── TGO Animated Logo Loader ─────────────────────────────────────────────────
//
// Pin-drop animation del logo TGO.
// SVG inline + CSS keyframes, sin dependencias externas.
//
// Uso:
//   <AnimatedLogoLoader />                    — fullscreen overlay
//   <AnimatedLogoLoader fullScreen={false} /> — inline (para loading.tsx)

import { useEffect, useState } from 'react'

interface AnimatedLogoLoaderProps {
  fullScreen?: boolean
}

export default function AnimatedLogoLoader({ fullScreen = true }: AnimatedLogoLoaderProps) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    // Force reflow then start animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPlaying(true))
    })
  }, [])

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
          filter: drop-shadow(0 30px 60px rgba(0,0,0,0.55));
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
        .tgo-loader .dot {
          transform: translate(0px, 0px) scale(1);
          transform-origin: 100px 80px;
        }
        .tgo-loader .dot-glow {
          opacity: 0;
          transform: scale(0.6);
          transform-origin: 155px 45px;
        }
        .tgo-loader .ring {
          stroke-dasharray: 100 100;
          stroke-dashoffset: 100;
        }
        .tgo-loader .wordmark {
          opacity: 0;
          transform: translateY(8px);
        }

        /* Playing state */
        .tgo-loader.playing .pin-group {
          animation: tgoPinDrop .95s cubic-bezier(.34,1.45,.55,1) .15s forwards;
        }
        .tgo-loader.playing .shadow {
          animation: tgoShadowGrow .95s ease-out .15s forwards;
        }
        .tgo-loader.playing .dot {
          animation:
            tgoDotTravel 1.05s cubic-bezier(.31,.85,.29,1.28) 1.1s forwards,
            tgoDotIdlePulse 2.2s ease-in-out 3.55s infinite alternate;
        }
        .tgo-loader.playing .dot-glow {
          animation:
            tgoGlowTravel 1.05s cubic-bezier(.31,.85,.29,1.28) 1.1s forwards,
            tgoGlowIdlePulse 2.2s ease-in-out 3.55s infinite alternate;
        }
        .tgo-loader.playing .ring {
          animation: tgoRingDraw 1.25s cubic-bezier(.45,.05,.25,1) 2.05s forwards;
        }
        .tgo-loader.playing .wordmark {
          animation: tgoFadeUp .8s ease-out 3.35s forwards;
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
          55%  { opacity: .12; transform: scale(0.7); }
          72%  { opacity: .32; transform: scale(1.18); }
          100% { opacity: .24; transform: scale(1); }
        }
        @keyframes tgoDotTravel {
          0%   { transform: translate(0px, 0px) scale(1); }
          18%  { transform: translate(-2px, -4px) scale(1.32); }
          100% { transform: translate(55px, -35px) scale(0.92); }
        }
        @keyframes tgoGlowTravel {
          0%   { opacity: 0; transform: translate(-55px, 35px) scale(0.6); }
          18%  { opacity: .55; transform: translate(-57px, 31px) scale(0.9); }
          100% { opacity: .55; transform: translate(0px, 0px) scale(1); }
        }
        @keyframes tgoDotIdlePulse {
          0%   { filter: drop-shadow(0 0 0 rgba(247,66,17,0)); }
          100% { filter: drop-shadow(0 0 7px rgba(247,66,17,.75)); }
        }
        @keyframes tgoGlowIdlePulse {
          0%   { opacity: .4; transform: translate(55px, -35px) scale(0.9); }
          100% { opacity: .7; transform: translate(55px, -35px) scale(1.25); }
        }
        @keyframes tgoRingDraw {
          from { stroke-dashoffset: 100; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes tgoFadeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .tgo-loader .pin-group,
          .tgo-loader .shadow,
          .tgo-loader .dot,
          .tgo-loader .dot-glow,
          .tgo-loader .wordmark {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .tgo-loader .dot {
            transform: translate(55px, -35px) scale(0.92) !important;
          }
          .tgo-loader .dot-glow {
            transform: translate(55px, -35px) scale(1) !important;
            opacity: .5 !important;
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
            <linearGradient id="tgoBgGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--tgo-state-trust, #1c1d38)" />
              <stop offset="100%" stopColor="#111225" />
            </linearGradient>
            <filter id="tgoBlur6" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* Background */}
          <rect x="0" y="0" width="200" height="200" rx="46" fill="url(#tgoBgGrad)" />

          {/* Landing shadow */}
          <ellipse className="shadow" cx="100" cy="152" rx="24" ry="6" fill="#000000" />

          {/* Pin */}
          <g className="pin-group">
            <path
              d="M100,50 C118.5,50 133,64.5 133,83 C133,108 100,150 100,150 C100,150 67,108 67,83 C67,64.5 81.5,50 100,50 Z"
              fill="var(--tgo-card, #f3eee2)"
            />
            <circle cx="100" cy="80" r="14" fill="var(--tgo-state-trust, #14152a)" />
          </g>

          {/* Glow */}
          <circle className="dot-glow" cx="100" cy="80" r="20" fill="var(--tgo-brand-primary, #f74211)" filter="url(#tgoBlur6)" />

          {/* Orange dot */}
          <circle className="dot" cx="100" cy="80" r="14" fill="var(--tgo-brand-primary, #f74211)" />

          {/* Ring */}
          <path
            className="ring"
            d="M171.8,69.5 A78,78 0 1 1 130.5,28.2"
            fill="none"
            stroke="var(--tgo-card, #f3eee2)"
            strokeWidth="9"
            strokeLinecap="round"
            pathLength="100"
          />
        </svg>
      </div>

      {/* Wordmark */}
      <div className="wordmark" style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 22,
          letterSpacing: '2.5px',
          color: 'var(--tgo-card, #f3eee2)',
          fontWeight: 600,
        }}>
          T<span style={{ color: 'var(--tgo-brand-primary, #f74211)' }}>GO</span>
        </div>
        <div style={{
          marginTop: 6,
          fontSize: 12,
          letterSpacing: '1.5px',
          textTransform: 'uppercase' as const,
          color: '#8b8ca3',
        }}>
          Cerca de vos
        </div>
      </div>
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
          background: 'var(--tgo-state-trust, #0b0c18)',
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
        background: 'var(--tgo-state-trust, #0b0c18)',
      }}
    >
      {content}
    </div>
  )
}
