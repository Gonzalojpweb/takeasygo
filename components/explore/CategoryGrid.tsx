'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface Category {
  name: string
  icon: string
  color: string
  bg: string
}

const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Restaurantes', icon: '🍔', color: '#F74211', bg: '#FFF5F0' },
  { name: 'Pizza', icon: '🍕', color: '#EAB308', bg: '#FEFCE8' },
  { name: 'Café & Deli', icon: '☕', color: '#713F12', bg: '#FEF3C7' },
  { name: 'Helados', icon: '🍦', color: '#EC4899', bg: '#FDF2F8' },
  { name: 'Carne', icon: '🥩', color: '#991B1B', bg: '#FEF2F2' },
  { name: 'Sushi', icon: '🍣', color: '#0F172A', bg: '#F8FAFC' },
  { name: 'Empanadas', icon: '🥟', color: '#D97706', bg: '#FFFBEB' },
  { name: 'Bebidas', icon: '🍷', color: '#7C3AED', bg: '#F5F3FF' },
]

export default function CategoryGrid({ categories }: { categories?: string[] }) {
  // Combinar categorías estáticas con dinámicas del API si existen
  const displayCategories = DEFAULT_CATEGORIES

  return (
    <div className="py-2 px-4">
      <div className="grid grid-cols-4 gap-4">
        {displayCategories.map((cat) => (
          <button 
            key={cat.name}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div 
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-transparent transition-all duration-300",
                "group-hover:scale-105 group-hover:shadow-md group-active:scale-95"
              )}
              style={{ backgroundColor: cat.bg }}
            >
              {cat.icon}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-primary transition-colors">
              {cat.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
