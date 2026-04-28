import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Router, Routes } from 'react-space-router'
import { Shell } from './Shell'
import { routes } from './routes'
import './styles.css'

function App() {
  return (
    <Router mode='history'>
      <Shell>
        <Suspense fallback={null}>
          <Routes routes={routes} />
        </Suspense>
      </Shell>
    </Router>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
