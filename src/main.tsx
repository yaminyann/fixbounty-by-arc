import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { BrowserRouter } from 'react-router-dom'
import { config } from './config'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider
            customTheme={{
              '--ck-font-family': "'DM Sans', sans-serif",
              '--ck-primary-button-background': '#000000',
              '--ck-primary-button-hover-background': '#EAB308',
              '--ck-primary-button-color': '#FFFFFF',
              '--ck-body-background': '#FAFAF8',
              '--ck-body-color': '#000000',
              '--ck-border-radius': '0px',
            }}
          >
            <AuthProvider>
              <App />
              <Toaster position="top-center" richColors />
            </AuthProvider>
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  </StrictMode>,
)

