import { forwardRef } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuContent = forwardRef(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-52 overflow-hidden rounded-control border border-border bg-card p-1 text-card-foreground shadow-lg data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
})

const DropdownMenuItem = forwardRef(function DropdownMenuItem(
  { className, inset, destructive = false, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-sm outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        inset && 'pl-8',
        destructive && 'text-danger-foreground focus:bg-danger-muted [&_svg]:text-danger-foreground',
        className,
      )}
      {...props}
    />
  )
})

const DropdownMenuCheckboxItem = forwardRef(function DropdownMenuCheckboxItem({ className, children, checked, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      className={cn(
        'relative flex min-h-9 cursor-pointer select-none items-center rounded-[7px] py-1.5 pl-8 pr-2.5 text-sm outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <DropdownMenuPrimitive.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
        <Check className="size-4 text-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
})

const DropdownMenuRadioItem = forwardRef(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex min-h-9 cursor-pointer select-none items-center rounded-[7px] py-1.5 pl-8 pr-2.5 text-sm outline-none transition-colors focus:bg-muted',
        className,
      )}
      {...props}
    >
      <DropdownMenuPrimitive.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
        <span className="size-2 rounded-pill bg-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
})

const DropdownMenuLabel = forwardRef(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn('px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-caption', inset && 'pl-8', className)}
      {...props}
    />
  )
})

const DropdownMenuSeparator = forwardRef(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
})

const DropdownMenuSubTrigger = forwardRef(function DropdownMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-sm outline-none focus:bg-muted data-[state=open]:bg-muted',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
})

const DropdownMenuSubContent = forwardRef(function DropdownMenuSubContent({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn('z-50 min-w-40 overflow-hidden rounded-control border border-border bg-card p-1 shadow-lg', className)}
      {...props}
    />
  )
})

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
export default DropdownMenu
