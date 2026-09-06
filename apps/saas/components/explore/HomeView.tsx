'use client'

// ── HomeView ─────────────────────────────────────────────────────────────────
//
// Wrapper que importa DiscoveryFeed.
// Mantiene la interfaz existente de ExploreClient.

import DiscoveryFeed from './DiscoveryFeed'

export default function HomeView({
  onCategorySelect,
}: {
  onCategorySelect?: (name: string) => void
}) {
  return (
    <DiscoveryFeed
      onCategorySelect={onCategorySelect}
    />
  )
}
