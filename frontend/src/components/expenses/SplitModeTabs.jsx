import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SPLIT_EQUAL, SPLIT_EXACT, SPLIT_PERCENTAGE } from './splitModel'

const MODES = [
  { value: SPLIT_EQUAL, label: 'Equally', hint: 'Everyone carries the same paisa.' },
  { value: SPLIT_EXACT, label: 'Exact amounts', hint: 'Type what each person owes.' },
  { value: SPLIT_PERCENTAGE, label: 'Percentage', hint: 'Assign shares of 100%.' },
]

/** Split-mode selector; `hint` is announced so the meaning is never colour/label only. */
export function SplitModeTabs({ value, onChange, disabled = false, className }) {
  const active = MODES.find((m) => m.value === value) ?? MODES[0]
  return (
    <div className={className}>
      <Tabs value={value} onValueChange={onChange}>
        <TabsList className="w-full" aria-label="Split type">
          {MODES.map((mode) => (
            <TabsTrigger
              key={mode.value}
              value={mode.value}
              disabled={disabled}
              className="flex-1"
            >
              {mode.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
        {active.hint}
      </p>
    </div>
  )
}

export { MODES as SPLIT_MODES }
export default SplitModeTabs
