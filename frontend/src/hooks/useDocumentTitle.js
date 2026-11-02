import { useEffect } from 'react'

const SUFFIX = ' · BalanceBook'

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title}${SUFFIX}` : `BalanceBook${SUFFIX}`
    return () => {
      document.title = previous
    }
  }, [title])
}

export default useDocumentTitle
