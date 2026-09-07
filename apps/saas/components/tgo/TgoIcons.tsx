'use client'

export function TgoFaceActivo({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 78" width={size} height={size * 1.22} fill="none">
      <path d="M32 2C15 2 2 15.6 2 32.6C2 54 32 76 32 76C32 76 62 54 62 32.6C62 15.6 49 2 32 2Z" fill="#F74211" />
      <circle cx="32" cy="30" r="19" fill="#fff" />
      <circle cx="25" cy="27" r="2.4" fill="#14171C" />
      <circle cx="39" cy="27" r="2.4" fill="#14171C" />
      <path d="M23 35c4 5 14 5 18 0" stroke="#14171C" strokeWidth="2.8" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function TgoFaceDescansando({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 78" width={size} height={size * 1.22} fill="none">
      <path d="M32 2C15 2 2 15.6 2 32.6C2 54 32 76 32 76C32 76 62 54 62 32.6C62 15.6 49 2 32 2Z" fill="#9A9284" />
      <circle cx="32" cy="30" r="19" fill="#fff" />
      <path d="M22 27c2-2 5-2 7 0" stroke="#565149" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M35 27c2-2 5-2 7 0" stroke="#565149" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M25 37c4 2 10 2 14 0" stroke="#565149" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function TgoFaceGuiño({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 78" width={size} height={size * 1.22} fill="none">
      <path d="M32 6C17.9 6 6 18.4 6 33C6 51.8 32 71.5 32 71.5C32 71.5 58 51.8 58 33C58 18.4 46.1 6 32 6Z" fill="#F74211" />
      <circle cx="32" cy="31" r="18" fill="#fff" />
      <path d="M22 28c2-2 5-2 7 0" stroke="#14171C" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="39" cy="28" r="2.2" fill="#14171C" />
      <path d="M24 36c3 4 12 4 15 0" stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function TgoFaceReferente({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 78" width={size} height={size * 1.22} fill="none">
      <path d="M32 6C17.9 6 6 18.4 6 33C6 51.8 32 71.5 32 71.5C32 71.5 58 51.8 58 33C58 18.4 46.1 6 32 6Z" fill="#F74211" />
      <circle cx="32" cy="31" r="18" fill="#F3F1EA" />
      <circle cx="24" cy="27" r="2.4" fill="#14171C" />
      <circle cx="40" cy="27" r="2.4" fill="#14171C" />
      <path d="M22 36c5 6 15 6 20 0" stroke="#14171C" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <path d="M14 20l4 4M50 20l-4 4M16 44l3-4M48 44l-3-4" stroke="#F74211" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function TgoLogoCenter({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none">
      <circle cx="32" cy="32" r="30" stroke="#F74211" strokeWidth="2.5" strokeDasharray="3 5" />
      <circle cx="32" cy="32" r="21" fill="#F74211" />
      <circle cx="26" cy="29" r="2.4" fill="#14171C" />
      <circle cx="38" cy="29" r="2.4" fill="#14171C" />
      <path d="M24 37c4 5 12 5 16 0" stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}
