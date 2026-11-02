import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva } from 'class-variance-authority'
import { cn, initials } from '@/lib/utils'

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
}

const variant = cva('relative shrink-0 overflow-hidden rounded-pill', {
  variants: { size: sizes },
  defaultVariants: { size: 'md' },
})

/**
 * Avatar with initials fallback. `name` drives the fallback letters and the
 * accessible label. `src` may be null (e.g. avatarUrl missing).
 */
export function Avatar({ name = '', src, size = 'md', className, fallbackClassName, ...props }) {
  return (
    <AvatarPrimitive.Root className={cn(variant({ size }), className)} {...props}>
      <AvatarPrimitive.Image
        src={src || undefined}
        alt={name ? `${name}'s avatar` : 'Avatar'}
        className="aspect-square h-full w-full object-cover"
      />
      <AvatarPrimitive.Fallback
        className={cn(
          'flex h-full w-full items-center justify-center bg-primary-muted font-display font-semibold text-primary',
          fallbackClassName,
        )}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

/** Overlapping stack for group cards; extra count rendered as a chip. */
export function AvatarStack({ members = [], max = 4, size = 'sm', className }) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <div className={cn('flex items-center -space-x-2', className)} aria-label={`${members.length} members`}>
      {shown.map((m, i) => (
        <Avatar
          key={m.user?.id ?? m.id ?? i}
          name={m.user?.name ?? m.name ?? ''}
          src={m.user?.avatarUrl ?? m.avatarUrl}
          size={size}
          className="ring-2 ring-card"
        />
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            'flex items-center justify-center rounded-pill bg-muted font-medium text-muted-foreground ring-2 ring-card',
            sizes[size],
            'text-[10px]',
          )}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  )
}

export default Avatar
