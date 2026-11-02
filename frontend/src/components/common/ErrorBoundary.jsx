import { Component } from 'react'
import { TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/button'
import { BrandMark } from '@/components/layout/Sidebar'

/**
 * App-level error boundary. React render errors must never leave a blank
 * screen; we show a calm recovery state with a real retry (full reload).
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep a breadcrumb for production debugging without noisy consoles in dev.
    console.error('[BalanceBook] Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <BrandMark className="size-9" />
        <div className="flex flex-col items-center gap-2">
          <span className="flex size-11 items-center justify-center rounded-pill bg-danger-muted">
            <TriangleAlert className="size-5 text-danger-foreground" aria-hidden />
          </span>
          <h1 className="font-display text-xl font-semibold text-foreground">The app hit an unexpected error</h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Your data is safe — nothing was changed. Reload to pick up where you left off.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload BalanceBook</Button>
      </div>
    )
  }
}

export default ErrorBoundary
