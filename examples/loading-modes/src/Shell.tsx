import React, { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, usePending, useRoute } from 'react-space-router'
import { clearCache } from './data'

/**
 * Top-of-page progress bar — driven by `usePending()`. Renders nothing
 * outside of an in-flight transition.
 */
function ProgressBar() {
  const pending = usePending()
  return pending ? <div className='progress-bar' aria-hidden /> : null
}

/**
 * Stopwatch that starts when a navigation begins and freezes when it
 * commits. Lets you feel the difference between modes in milliseconds.
 */
function NavTimer() {
  const pending = usePending()
  const [ms, setMs] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (pending) {
      startRef.current = performance.now()
      setMs(0)
      const id = setInterval(() => {
        if (startRef.current != null) setMs(performance.now() - startRef.current)
      }, 16)
      return () => clearInterval(id)
    }
    if (startRef.current != null) {
      setMs(performance.now() - startRef.current)
      startRef.current = null
    }
  }, [pending])

  return (
    <span className={`status-pill ${pending ? 'live' : ''}`}>
      {pending ? 'navigating…' : 'idle'} · {(ms / 1000).toFixed(2)}s
    </span>
  )
}

function CurrentRoute() {
  const route = useRoute()
  return <span className='status-pill'>{route?.pathname ?? '—'}</span>
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className='app'>
      <ProgressBar />
      <aside className='sidebar'>
        <h1>Loading Modes</h1>
        <nav>
          <Link
            href='/'
            className={(c) => `nav-link${c ? ' current' : ''}`}
          >
            Overview
            <small>How to read this demo</small>
          </Link>
          <Link
            href='/mode-a'
            className={(c) => `nav-link${c ? ' current' : ''}`}
          >
            (a) Immediate + skeletons
            <small>Show new shell + skeletons fast</small>
          </Link>
          <Link
            href='/mode-b'
            className={(c) => `nav-link${c ? ' current' : ''}`}
          >
            (b) Wait for ready
            <small>Hold old page until everything's ready</small>
          </Link>
          <Link
            href='/mode-c'
            className={(c) => `nav-link${c ? ' current' : ''}`}
          >
            (c) Timed fallback
            <small>(b) for 1s, then fall back to (a)</small>
          </Link>
        </nav>
        <div className='sidebar-footer'>
          <div className='status-row'>
            <NavTimer />
          </div>
          <div className='status-row'>
            <CurrentRoute />
          </div>
          <button
            type='button'
            className='button'
            onClick={() => {
              clearCache()
              window.location.reload()
            }}
          >
            Reset (clear cache + reload)
          </button>
          <p className='note'>
            Tip: use the browser back/forward buttons. Click between modes back-to-back to feel the contrast.
          </p>
        </div>
      </aside>
      <main className='main'>{children}</main>
    </div>
  )
}
