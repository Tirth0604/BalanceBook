import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware class joiner. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/** Group array items by a key function → plain object of arrays. */
export function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn]
    ;(acc[key] ||= []).push(item)
    return acc
  }, {})
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** Trailing-edge debounce. Returns a cancellable function. */
export function debounce(fn, wait = 250) {
  let timer = null
  const debounced = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}

/** Initials for avatar fallback: "Ravi Kumar" → "RK", up to 2 letters. */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function escapeRegExp(string = '') {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const uid = () => Math.random().toString(36).slice(2, 10)

/** Build a query string from an object, dropping empty values. */
export function toQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v))
  })
  const s = search.toString()
  return s ? `?${s}` : ''
}
