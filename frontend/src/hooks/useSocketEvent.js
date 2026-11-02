import { useEffect, useRef } from 'react'
import { getSocket, on } from '@/lib/io'

/**
 * Subscribe to a socket event for the lifetime of the component.
 * Re-runs when the socket instance changes (connect / login / reconnect to a
 * new instance), so handlers survive auth transitions.
 */
export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const socket = getSocket()

  useEffect(() => {
    if (!socket) return undefined
    return on(event, (...args) => handlerRef.current?.(...args))
  }, [socket, event])
}

export default useSocketEvent
