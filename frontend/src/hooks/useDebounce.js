import { useEffect, useState } from 'react'

export function useDebounce(value, wait = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), wait)
    return () => clearTimeout(t)
  }, [value, wait])
  return debounced
}

export default useDebounce
