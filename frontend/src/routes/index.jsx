import { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { appRoutes } from './appRoutes'
import AppShell from '@/components/layout/AppShell'
import RequireAuth, { RedirectIfAuthed } from '@/components/layout/RequireAuth'
import { RootLayout } from '@/routes/RootLayout'
import NotFound from '@/pages/NotFound'

/**
 * All page modules are resolved through a glob so parallel build phases never
 * break the bundle: a route wired to `['Expenses']` activates as soon as
 * pages/Expenses.jsx exists and falls back to the honest NotFound state
 * ("still being built") until then.
 */
const pageModules = import.meta.glob('../pages/*.jsx')

function resolvePage(candidates) {
  for (const name of candidates) {
    const loader = pageModules[`../pages/${name}.jsx`]
    if (loader) return loader
  }
  return null
}

function PageFallback() {
  return (
    <div
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-3"
      role="status"
      aria-label="Loading page"
    >
      <div className="size-8 animate-spin rounded-pill border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}

/** Wrap a lazy page in Suspense once, reusable as a Route Component. */
function page(loader) {
  const LazyComp = lazy(loader)
  return function Page() {
    return (
      <Suspense fallback={<PageFallback />}>
        <LazyComp />
      </Suspense>
    )
  }
}

const Landing = page(() => import('@/pages/Landing'))
const Login = page(() => import('@/pages/Login'))
const Register = page(() => import('@/pages/Register'))
const VerifyOtp = page(() => import('@/pages/VerifyOtp'))
const ForgotPassword = page(() => import('@/pages/ForgotPassword'))
const ResetPassword = page(() => import('@/pages/ResetPassword'))
const JoinGroup = page(() => import('@/pages/JoinGroup'))

const shellChildren = appRoutes.map(({ path, page: candidates, label }) => {
  const loader = resolvePage(candidates)
  return {
    path,
    Component: loader
      ? page(loader)
      : // Page owned by a parallel build phase and not landed yet: keep the
        // route real (sidebar item navigates somewhere sensible) and tell the
        // truth in the 404 state.
        function PendingPage() {
          return <NotFound pendingFor={label} />
        },
  }
})

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: 'join', Component: JoinGroup },
      { path: 'groups/join', Component: JoinGroup },
      {
        element: <RedirectIfAuthed />,
        children: [
          { index: true, Component: Landing },
          { path: 'login', Component: Login },
          { path: 'register', Component: Register },
          { path: 'verify-otp', Component: VerifyOtp },
          { path: 'forgot-password', Component: ForgotPassword },
          { path: 'reset-password', Component: ResetPassword },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [...shellChildren, { path: '*', Component: () => <NotFound /> }],
          },
        ],
      },
    ],
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
