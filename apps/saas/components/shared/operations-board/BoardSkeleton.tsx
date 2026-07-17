'use client'

import { cn } from '@/lib/utils'

interface BoardSkeletonProps {
  columns?: number
}

export default function BoardSkeleton({ columns = 6 }: BoardSkeletonProps) {
  return (
    <div className="flex h-[calc(100dvh-140px)] gap-0 animate-pulse">
      {/* Board area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar skeleton */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <div className="h-8 w-48 bg-muted rounded-xl" />
          <div className="h-8 w-20 bg-muted rounded-xl ml-auto" />
          <div className="h-8 w-8 bg-muted rounded-lg" />
          <div className="h-8 w-8 bg-muted rounded-lg" />
        </div>

        {/* Columns skeleton */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="flex gap-4 h-full">
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="flex flex-col min-w-[260px] w-[280px]">
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2.5 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-muted" />
                    <div className="h-3 w-20 bg-muted rounded" />
                  </div>
                  <div className="h-5 w-6 bg-muted rounded-full" />
                </div>
                {/* Cards skeleton */}
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="rounded-xl border border-border/30 p-3 space-y-2">
                      <div className="flex justify-between">
                        <div className="h-4 w-16 bg-muted rounded" />
                        <div className="h-3 w-12 bg-muted rounded" />
                      </div>
                      <div className="h-3 w-24 bg-muted rounded" />
                      <div className="flex justify-between">
                        <div className="h-3 w-16 bg-muted rounded" />
                        <div className="h-3 w-12 bg-muted rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Context panel skeleton */}
      <div className="hidden lg:block w-[340px] shrink-0 border-l border-border/50">
        <div className="p-4 space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-3/4 bg-muted rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-2/3 bg-muted rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
