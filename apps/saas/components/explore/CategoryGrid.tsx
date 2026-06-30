'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface Category {
  name: string
  icon: string
  color: string
  bg: string
}

const CATEGORIES: Category[] = [
  { name: 'Restaurantes', icon: '🍽️', color: '#F74211', bg: '#FFF5F0' },
  { name: 'Pizza', icon: '🍕', color: '#EAB308', bg: '#FEFCE8' },
  { name: 'Hamburguesas', icon: '🍔', color: '#DC2626', bg: '#FEF2F2' },
  { name: 'Sushi', icon: '🍣', color: '#0F172A', bg: '#F8FAFC' },
  { name: 'Empanadas', icon: '🥟', color: '#D97706', bg: '#FFFBEB' },
  { name: 'Pasta', icon: '🍝', color: '#16A34A', bg: '#F0FDF4' },
  { name: 'Tacos', icon: '🌮', color: '#7C3AED', bg: '#FAF5FF' },
  { name: 'Parrilla', icon: '🥩', color: '#991B1B', bg: '#FEF2F2' },
]

export default function CategoryGrid({ categories, onCategorySelect }: { categories?: string[]; onCategorySelect?: (name: string) => void }) {
  const displayCategories = categories
    ? CATEGORIES.filter(c => c.name === 'Restaurantes' || categories.includes(c.name))
    : CATEGORIES

  return (
    <div className="py-2 px-4">
      <div className="grid grid-cols-4 gap-4">
        {displayCategories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => onCategorySelect?.(cat.name)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-transparent transition-all duration-300",
                "active:scale-90 active:shadow-md"
              )}
              style={{ backgroundColor: cat.bg }}
            >
              {cat.icon}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 transition-colors">
              {cat.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
