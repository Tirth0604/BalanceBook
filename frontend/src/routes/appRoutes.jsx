/**
 * Route table for the authenticated app shell.
 *
 * `page` is the filename under src/pages/ (first existing candidate wins).
 * Pages land in parallel (another agent owns Expenses → Insights); the
 * router resolves this table against `import.meta.glob('../pages/*.jsx')`
 * at build/dev time, so a route activates the moment its page file exists
 * and gracefully degrades to the "still being built" NotFound until then.
 */
export const appRoutes = [
  { path: 'dashboard', page: ['Dashboard'], label: 'Dashboard' },
  { path: 'groups', page: ['Groups'], label: 'My Groups' },
  { path: 'groups/:groupId', page: ['GroupDetails'], label: 'Group' },
  { path: 'expenses', page: ['Expenses'], label: 'Expenses' },
  { path: 'expenses/new', page: ['AddExpense'], label: 'Add expense' },
  { path: 'balances', page: ['Balances'], label: 'Balances' },
  { path: 'settlements', page: ['Settlements'], label: 'Settlements' },
  { path: 'analytics', page: ['Analytics'], label: 'Analytics' },
  { path: 'budgets', page: ['Budgets'], label: 'Budgets' },
  { path: 'insights', page: ['Insights'], label: 'Insights' },
  { path: 'notifications', page: ['Notifications'], label: 'Notifications' },
  { path: 'profile', page: ['Profile'], label: 'Profile' },
  { path: 'settings', page: ['Settings'], label: 'Settings' },
]

export default appRoutes
