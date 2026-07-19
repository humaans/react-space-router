import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Router, Routes } from 'react-space-router'
import { Shell } from './Shell'
import { routes } from './routes'
import { data } from './data'
import { routerMode } from './routing'
import './styles.css'

function App() {
  return (
    <Router mode={routerMode} pendingDelayMs={500} data={data} routes={routes}>
      <Shell>
        <Suspense fallback={null}>
          <Routes />
        </Suspense>
      </Shell>
    </Router>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
