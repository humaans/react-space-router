// Pending navigation state: usePending, usePendingRoute, DelayedSuspense
// holds, and async-mode popstate transition semantics.
import test from 'ava'
import { act, Suspense, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Router,
  Routes,
  DelayedSuspense,
  useSpaceRouter,
  useLinkProps,
  usePending,
  usePendingRoute,
  type PreparedHandle,
} from '../src/index.tsx'
import { g, setup } from './helpers.ts'

test.serial('usePending flips while a transition is in flight', async (t) => {
  setup()

  const root = document.getElementById('root')

  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function Slow() {
    // The first render of /slow throws this promise to suspend until the gate resolves.
    if (!(Slow as any).ready) {
      throw slowGate.then(() => {
        ;(Slow as any).ready = true
      })
    }
    return <div>Slow</div>
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/slow', component: Slow },
  ]

  const pendingSamples: boolean[] = []
  let router
  function Capture() {
    const r = useSpaceRouter()
    const pending = usePending()
    pendingSamples.push(pending)
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync routes={routes}>
        <Capture />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  pendingSamples.length = 0

  await act(async () => {
    router.navigate('/slow')
  })

  // While suspended, React is mid-transition: pending should have flipped true.
  t.true(pendingSamples.includes(true), 'usePending was true during the suspended transition')

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
    await Promise.resolve()
  })

  // After commit, the latest pending sample is false.
  t.is(pendingSamples[pendingSamples.length - 1], false, 'usePending settles to false after commit')
})

test.serial('DelayedSuspense renders fallback normally outside delayed navigation hold', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolveChild: (() => void) | null = null
  const childGate = new Promise<void>((r) => {
    resolveChild = r
  })

  function Child() {
    if (!(Child as any).ready) {
      throw childGate.then(() => {
        ;(Child as any).ready = true
      })
    }
    return <span>Ready</span>
  }

  function App() {
    return (
      <Router routes={[]} sync>
        <DelayedSuspense fallback={<span>Fallback</span>}>
          <Child />
        </DelayedSuspense>
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><span>Fallback</span></div>')

  await act(async () => {
    resolveChild!()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><span>Ready</span></div>')
})

test.serial('DelayedSuspense holds fallback during route transition delay', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function SlowChild() {
    if (!(SlowChild as any).ready) {
      throw slowGate.then(() => {
        ;(SlowChild as any).ready = true
      })
    }
    return <div>Slow</div>
  }

  function SlowPage() {
    return (
      <DelayedSuspense fallback={<div>Inner fallback</div>}>
        <SlowChild />
      </DelayedSuspense>
    )
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/slow', component: SlowPage },
  ]

  let router

  function Capture() {
    const r = useSpaceRouter()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync pendingDelayMs={10_000} routes={routes}>
        <Capture />
        <Suspense fallback={<div>Outer fallback</div>}>
          <Routes />
        </Suspense>
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    router.navigate('/slow')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Home</div></div>')

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Slow</div></div>')
})

test.serial('usePendingRoute exposes the transformed in-flight route and clears on settle', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })
  let ready = false

  function Probe() {
    const pendingRoute = usePendingRoute()
    const props = useLinkProps('/items/beacon')
    return (
      <div>
        <a {...props}>Beacon</a>
        <span data-pending-id={pendingRoute?.params.id ?? 'none'} />
        <span data-pending-url={pendingRoute?.url ?? 'none'} />
      </div>
    )
  }

  function Item() {
    if (!ready) {
      throw slowGate.then(() => {
        ready = true
      })
    }
    return <div>Item</div>
  }

  const routes = [
    { path: '/', component: () => null },
    { path: '/items/:id', component: Item },
  ]

  function App() {
    return (
      <Router sync transformRoute={(route) => ({ ...route, url: `${route.url}?via=transform` })} routes={routes}>
        <Probe />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.querySelector('[data-pending-id]')?.getAttribute('data-pending-id'), 'none')

  await act(async () => {
    window.document.querySelector('a')!.click()
  })

  // mid-flight: the pending route is matched and transformed, params readable
  t.is(window.document.querySelector('[data-pending-id]')?.getAttribute('data-pending-id'), 'beacon')
  t.is(
    window.document.querySelector('[data-pending-url]')?.getAttribute('data-pending-url'),
    '/items/beacon?via=transform',
  )
  // per-link pending still matches the pre-transform href links are written in
  t.is(window.document.querySelector('a')?.getAttribute('data-pending'), '')

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.querySelector('[data-pending-id]')?.getAttribute('data-pending-id'), 'none')
  t.true(window.document.body.innerHTML.includes('<div>Item</div>'))
})

test.serial('usePendingRoute registers history-driven navigations', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })
  let ready = false

  function Probe() {
    const pendingRoute = usePendingRoute()
    return <span data-pending-path={pendingRoute?.pathname ?? 'none'} />
  }

  function Slow() {
    if (!ready) {
      throw slowGate.then(() => {
        ready = true
      })
    }
    return <div>Slow</div>
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/slow', component: Slow },
  ]

  function App() {
    return (
      <Router sync routes={routes}>
        <Probe />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  // simulate the browser back/forward button: change the URL and dispatch
  // popstate without going through navigate()
  await act(async () => {
    g.location.href = '/slow'
    g.location.pathname = '/slow'
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })

  t.is(window.document.querySelector('[data-pending-path]')?.getAttribute('data-pending-path'), '/slow')
  // the previous page stays committed while the destination suspends
  t.true(window.document.body.innerHTML.includes('<div>Home</div>'))

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.querySelector('[data-pending-path]')?.getAttribute('data-pending-path'), 'none')
  t.true(window.document.body.innerHTML.includes('<div>Slow</div>'))
})

test.serial('popstate emits are deferred to a macrotask in async mode', async (t) => {
  setup()
  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/next', component: () => <div>Next</div> },
  ]

  function App() {
    return (
      <Router routes={routes}>
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(<App />)
  })
  t.true(window.document.body.innerHTML.includes('<div>Home</div>'))

  // Dispatch popstate and drain only microtasks: the route must NOT have
  // committed yet. The traversal emit is deferred to a macrotask (via the
  // space-router `schedule` option) so React treats back/forward as a
  // regular async transition instead of a synchronous popstate flush.
  act(() => {
    g.location.href = '/next'
    g.location.pathname = '/next'
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  t.true(
    window.document.body.innerHTML.includes('<div>Home</div>'),
    'traversal emit must not commit within the popstate task',
  )

  await act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })
  t.true(window.document.body.innerHTML.includes('<div>Next</div>'))
})

test.serial('async-mode popstate after a cold load holds the previous route and paints pending state', async (t) => {
  setup()
  g.location.href = '/items/courier'
  g.location.pathname = '/items/courier'

  const root = document.getElementById('root')
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  // strict fetch-as-you-render data layer, like the demo's
  const cache = new Map<string, { promise: Promise<void> | null; value: string | null }>()
  const prepareKey = (key: string, ms: number): PreparedHandle[] => {
    let entry = cache.get(key)
    if (entry === undefined) {
      const e: { promise: Promise<void> | null; value: string | null } = { promise: null, value: null }
      e.promise = wait(ms).then(() => {
        e.value = key
        e.promise = null
      })
      cache.set(key, e)
      entry = e
    }
    return [{ promise: entry.promise ?? Promise.resolve(), release: () => {} }]
  }
  const readKey = (key: string): string => {
    const entry = cache.get(key)
    if (entry === undefined) throw new Error(`read(${key}) before prepare`)
    if (entry.promise) throw entry.promise
    return entry.value as string
  }

  function Item({ id }: { id?: string }) {
    // consumes the pending route INSIDE the suspended boundary, like a
    // detail-swap fade would
    const pendingRoute = usePendingRoute()
    const pendingId = pendingRoute?.params.id ?? null
    const fading = pendingId != null && pendingId !== id
    return (
      <div data-detail data-fading={String(fading)}>
        {readKey(`item-${id}`)}
      </div>
    )
  }

  const routes = [
    {
      path: '/items/:id',
      resolver: () => wait(30).then(() => ({ default: Item })),
      prepare: ({ params }: { params: Record<string, string> }) => prepareKey(`item-${params.id}`, 100),
    },
  ]

  function App() {
    return (
      <Router routes={routes}>
        <Suspense fallback={null}>
          <Routes />
        </Suspense>
      </Router>
    )
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(<App />)
  })
  await act(async () => {
    await wait(250)
  })
  t.is(document.querySelector('[data-detail]')?.textContent, 'item-courier')

  // simulate the browser back button to an uncached item
  await act(async () => {
    g.location.href = '/items/beacon'
    g.location.pathname = '/items/beacon'
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })
  await act(async () => {
    await wait(50)
  })

  // mid-flight: previous detail held, pending route painted into the held tree
  t.is(document.querySelector('[data-detail]')?.textContent, 'item-courier')
  t.is(document.querySelector('[data-detail]')?.getAttribute('data-fading'), 'true')

  await act(async () => {
    await wait(200)
  })
  t.is(document.querySelector('[data-detail]')?.textContent, 'item-beacon')
  t.is(document.querySelector('[data-detail]')?.getAttribute('data-fading'), 'false')
})
