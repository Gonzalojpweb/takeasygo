'use client'

import dynamic from 'next/dynamic'

const MenuPWAProvider = dynamic(() => import('./MenuPWAProvider'), {
  ssr: false,
})

interface Props {
  primaryColor: string
  bgColor: string
  textColor: string
  manifestUrl: string
}

export default function PWALoader(props: Props) {
  return <MenuPWAProvider {...props} />
}
