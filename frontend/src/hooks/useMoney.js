import { useMemo } from 'react'
import { useAppSelector } from '@/store/hooks'
import * as money from '@/lib/money'

/** Money helpers bound to the current user's preferred currency. */
export function useMoney() {
  const currency = useAppSelector((state) => state.auth.user?.preferredCurrency) || 'INR'
  return useMemo(
    () => ({
      currency,
      format: (minor, code = currency) => money.format(minor, code),
      formatSigned: (minor, code = currency) => money.formatSigned(minor, code),
      formatCompact: (minor, code = currency) => money.formatCompact(minor, code),
      toMinor: (amount, code = currency) => money.toMinor(amount, code),
      fromMinor: (minor, code = currency) => money.fromMinor(minor, code),
      symbol: money.currencySymbol(currency),
    }),
    [currency],
  )
}

export default useMoney
