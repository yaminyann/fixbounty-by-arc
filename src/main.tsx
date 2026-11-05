import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { BrowserRouter } from 'react-router-dom'
import { wagmiConfig } from '@/lib/wagmi'
import { AuthProvider } from '@/contexts/AuthContext'
import { IdentityProvider } from '@/contexts/IdentityContext'
import App from '@/App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <IdentityProvider>
              <App />
              <Toaster position="bottom-right" closeButton toastOptions={{ classNames: { toast: "font-sans !rounded-lg !border-line !shadow-pop" } }} />
            </IdentityProvider>
          </AuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </StrictMode>,
)
