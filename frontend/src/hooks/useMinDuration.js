import { useEffect, useRef, useState } from 'react'

/**
 * Skeleton flash guard (docs/06 UX rule 6): while `active` the flag is true;
 * after it settles the flag stays true for at least `ms` total so a fast
 * response never causes a skeleton flash. First paint with an already-true
 * `active` starts the clock immediately.
 */
export function useMinDuration(active, ms = 300) {
  const [show, setShow] = useState(Boolean(active))
  const startRef = useRef(active ? Date.now() : 0)

  useEffect(() => {
    if (active) {
      if (!show) setShow(true)
      startRef.current = Date.now()
      return undefined
    }
    if (!startRef.current) return undefined // never was active → no skeleton ever
    const remaining = Math.max(0, ms - (Date.now() - startRef.current))
    const t = setTimeout(() => setShow(false), remaining)
    return () => clearTimeout(t)
  }, [active, ms, show])

  return show
}

export default useMinDuration
