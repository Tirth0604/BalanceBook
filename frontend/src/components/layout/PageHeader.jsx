import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Standard page header: back link, title, subtitle, actions slot. */
export function PageHeader({ title, subtitle, actions, back, backTo, className }) {
  const navigate = useNavigate()
  const onBack = () => {
    if (backTo) navigate(backTo)
    else navigate(-1)
  }
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {back ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-1.5 inline-flex h-8 items-center gap-1.5 rounded-control text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {typeof back === 'string' ? back : 'Back'}
          </button>
        ) : null}
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export default PageHeader
