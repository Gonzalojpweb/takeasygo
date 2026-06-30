import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const _nf = new Intl.NumberFormat('es-AR')
export function fmt(n: number): string {
  return _nf.format(n)
}
