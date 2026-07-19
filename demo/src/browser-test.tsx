import React, { Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BlockNavigation, Link, Router, Routes } from 'react-space-router'

function Index() {
  return (
    <main>
      <h1>History fixture</h1>
      <Link href='/browser-test/a'>Open page A</Link>
    </main>
  )
}

function TallPage({ name, next }: { name: string; next?: string }) {
  return (
    <>
      <nav>
        {next && (
          <>
            <Link href={next}>Open page B</Link>
            <Link href={`${next}#anchor`}>Open page B at anchor</Link>
          </>
        )}
        <Link href='#anchor'>Jump to anchor</Link>
      </nav>
      <main>
        <h1>Page {name}</h1>
        <p>Both destinations stay tall so the browser can restore a meaningful window scroll position.</p>
        <h2 id='anchor'>Anchor</h2>
      </main>
    </>
  )
}

const routes = [
  { path: '/browser-test.html', component: Index },
  { path: '/browser-test/a', component: () => <TallPage name='A' next='/browser-test/b' /> },
  { path: '/browser-test/b', component: () => <TallPage name='B' /> },
]

function BrowserFixture() {
  const [dirty, setDirty] = useState(false)

  return (
    <Router routes={routes}>
      <aside className='guard-controls'>
        <label>
          <input type='checkbox' checked={dirty} onChange={(event) => setDirty(event.currentTarget.checked)} />
          Unsaved changes
        </label>
      </aside>
      {dirty && (
        <BlockNavigation>
          {({ proceed, cancel }) => (
            <div role='dialog' aria-label='Discard unsaved changes?' className='guard-dialog'>
              <p>Discard unsaved changes?</p>
              <button onClick={cancel}>Stay</button>
              <button
                onClick={() => {
                  proceed()
                  setDirty(false)
                }}
              >
                Discard
              </button>
            </div>
          )}
        </BlockNavigation>
      )}
      <Suspense fallback={null}>
        <Routes />
      </Suspense>
    </Router>
  )
}

createRoot(document.getElementById('root')!).render(<BrowserFixture />)
