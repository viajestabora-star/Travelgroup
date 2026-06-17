import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App.jsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 300_000,        // 5 min — datos frescos sin re-fetch innecesario
      gcTime: 600_000,           // 10 min — entradas en cache antes de garbage collect
      refetchOnWindowFocus: false, // ERP: el usuario cambia de pestaña constantemente
      retry: 1,                  // 1 reintento en fallo de red (Supabase eventual)
    },
    mutations: {
      retry: 0,                  // Mutations nunca se reintentan solas (idempotencia no garantizada)
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && (
        <ReactQueryDevtools
          initialIsOpen={false}    // Panel cerrado por defecto, toggle con el icono
          buttonPosition="bottom-left" // Esquina libre de la UI del ERP
        />
      )}
    </QueryClientProvider>
  </React.StrictMode>,
)
