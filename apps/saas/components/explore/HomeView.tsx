'use client'

// ── HomeView ─────────────────────────────────────────────────────────────────
//
// Wrapper que importa DiscoveryFeed.
// Mantiene la interfaz existente de ExploreClient.

import DiscoveryFeed from './DiscoveryFeed'

export default function HomeView({
  onOpenLeadModal,
  onCategorySelect,
}: {
  onOpenLeadModal: () => void
  onCategorySelect?: (name: string) => void
}) {
  return (
    <DiscoveryFeed
      onOpenLeadModal={onOpenLeadModal}
      onCategorySelect={onCategorySelect}
    />
  )
}
