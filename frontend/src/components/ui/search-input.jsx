import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Debounced search input. Emits the trimmed value after `wait` ms of idle.
 * Works uncontrolled (debounced) or controlled (parent owns the value).
 */
export function SearchInput({
  value: controlledValue,
  onSearch,
  placeholder = 'Search…',
  wait = 300,
  className,
  ariaLabel = 'Search',
  ...props
}) {
  const [inner, setInner] = useState('')
  const controlled = controlledValue !== undefined
  const value = controlled ? controlledValue : inner
  const cbRef = useRef(onSearch)
  cbRef.current = onSearch
  const mounted = useRef(false)

  useEffect(() => {
    // don't emit on first mount; parent already has its own state
    if (!mounted.current) {
      mounted.current = true
      return undefined
    }
    const t = setTimeout(() => cbRef.current?.(value.trim()), wait)
    return () => clearTimeout(t)
  }, [value, wait])

  const clear = () => {
    if (!controlled) setInner('')
    cbRef.current?.('')
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className="pointer-events-none absolute left-3 size-4 text-caption" aria-hidden />
      <input
        type="search"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          if (controlled) cbRef.current?.(e.target.value.trim())
          else setInner(e.target.value)
        }}
        placeholder={placeholder}
        className="h-10 w-full rounded-control border border-input bg-card pl-9 pr-9 text-sm text-foreground shadow-sm transition-colors placeholder:text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2.5 rounded-[6px] p-1 text-caption transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export default SearchInput
