import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InsightCard, { metricChips } from '../InsightCard'

/*
 * Fixtures are copied verbatim from the live API (GET /api/v1/groups/:id/insights for the
 * seeded USD group "Squad Lunches" and the INR group "Flat 704"), because the whole point of
 * the card is that its chips equal the payload's numbers: no client-side math, no re-format.
 */
const squadUsd = {
  id: 'contribution_share:me',
  type: 'contribution_share',
  severity: 'info',
  title: 'Tirth Gandhi fund 0% of this group',
  body: '$0.00 paid out vs $30.32 consumed, so the net position is $30.32 you still owe.',
  metric: { paidMinor: 0, consumedMinor: 3032, netMinor: -3032, fundedPercent: 0, spentMinor: 40372 },
  window: { preset: 'all', from: null, to: null },
}

const flatInr = {
  id: 'top_category:accommodation',
  type: 'top_category',
  severity: 'info',
  title: 'Accommodation is your biggest line',
  body: '₹65,000.00 — 71.3% of everything recorded in this window, across 1 expense.',
  metric: { category: 'accommodation', totalMinor: 6500000, percentOfSpend: 71.3, expenseCount: 1 },
  window: { preset: 'all', from: null, to: null },
}

const debtAging = {
  id: 'debt_aging:6aec8732a7e8e75ffe743c5d',
  type: 'debt_aging',
  severity: 'warning',
  title: '₹33,707.17 is still unsettled',
  body: 'You last shared an expense 30 days ago and still owe ₹21,833.79 overall.',
  metric: {
    userId: '6aec8732a7e8e75ffe743c5d',
    owesMinor: 2183379,
    outstandingMinor: 3370717,
    ageDays: 30,
    oldestExpenseDate: '2026-10-06T13:40:04.779Z',
    debtorCount: 2,
  },
  window: { preset: 'all', from: null, to: null },
}

const budgetPressure = {
  id: 'budget_pressure:b1',
  type: 'budget_pressure',
  severity: 'warning',
  title: 'Groceries has used 92% of its budget',
  body: '$92.00 of $100.00 spent in 2026-11.',
  metric: {
    budgetId: 'b1',
    currency: 'USD',
    percentUsed: 92,
    spentMinor: 9200,
    limitMinor: 10000,
    remainingMinor: 800,
    thresholdHit: 90,
    pressuredCount: 1,
  },
  window: { preset: 'this_month', from: null, to: null },
}

function renderCard(insight, currency) {
  return render(
    <MemoryRouter>
      <InsightCard insight={insight} currency={currency} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('InsightCard metric chips', () => {
  it('prints the minor units from metric exactly, in the payload currency', () => {
    const { container } = renderCard(squadUsd, 'USD')
    // $0.00 paid, $30.32 consumed, −$30.32 net, 0% funded — the payload's own numbers.
    expect(container.textContent).toContain('$0.00')
    expect(container.textContent).toContain('$30.32')
    expect(container.textContent).toContain('0%')
    expect(container.textContent).toContain('paid')
    expect(container.textContent).toContain('used')
    expect(container.textContent).toContain('funded')
  })

  it('never prints the other currency’s glyph on a USD payload', () => {
    const { container } = renderCard(squadUsd, 'USD')
    expect(container.textContent).not.toContain('₹')
  })

  it('renders an INR payload through lib/money grouping', () => {
    const { container } = renderCard(flatInr, 'INR')
    expect(container.textContent).toContain('₹65,000.00')
    expect(container.textContent).toContain('71.3%')
    expect(container.textContent).toContain('accommodation')
    expect(container.textContent).toContain('top category')
  })

  it('covers the rest of the rules the service emits', () => {
    const { container } = renderCard(debtAging, 'INR')
    expect(container.textContent).toContain('₹21,833.79')
    expect(container.textContent).toContain('₹33,707.17')
    expect(container.textContent).toContain('30')
    expect(container.textContent).toContain('debt aging')
  })

  it('uses the budget’s own currency, not the scope’s', () => {
    const { container } = renderCard(budgetPressure, 'INR')
    expect(container.textContent).toContain('$92.00')
    expect(container.textContent).toContain('$100.00')
    expect(container.textContent).toContain('92%')
    expect(container.textContent).not.toContain('₹92.00')
  })

  it('shows nothing invented when a rule sends no metric fields', () => {
    const bare = { id: 'x', type: 'spend_trend', severity: 'info', title: 'Quiet', body: 'No numbers.' }
    const { container } = renderCard(bare, 'INR')
    expect(container.textContent).toContain('Quiet')
    expect(container.textContent).not.toMatch(/[₹$]/)
    expect(container.textContent).not.toContain('0%')
  })

  it('only ever reads server-supplied fields, so a chip is a cited number', () => {
    const chips = metricChips(squadUsd, 'USD')
    expect(chips.map((chip) => [chip.key, chip.value])).toEqual([
      ['paidMinor', 0],
      ['consumedMinor', 3032],
      ['netMinor', -3032],
      ['fundedPercent', 0],
    ])
    expect(chips[0].currency).toBe('USD')
    expect(metricChips({ type: 'not_a_real_rule', metric: { paidMinor: 1 } }, 'INR')).toEqual([])
  })
})
