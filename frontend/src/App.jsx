import { Provider } from 'react-redux'
import { store } from '@/store'
import { ToastProvider } from '@/components/ui/toast'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import AppRouter from '@/routes'
import '@/index.css'

export default function App() {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </Provider>
    </ErrorBoundary>
  )
}
