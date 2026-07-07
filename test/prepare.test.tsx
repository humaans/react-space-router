// Route prepare lifecycle: initial-render prepare, resolver preloading,
// and PreparedHandle pinning/release across navigations.
import test from 'ava'
import { act, Component, StrictMode, Suspense, useEffect, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import {
  Router,
  RouterContext,
  Routes,
  useInternalRouterInstance,
  useRoute,
  type PreparedHandle,
  type Route,
} from '../src/index.tsx'
import { g, setup } from './helpers.ts'

test.serial('Routes prepares the initial route during the first render', (t) => {
  let prepareCalls = 0

  const routes = [
    {
      path: '/',
      prepare: () => {
        prepareCalls++
      },
      component: () => <div>Home</div>,
    },
  ]

  const matched = {
    pattern: '/',
    url: '/',
    pathname: '/',
    params: {},
    query: {},
    search: '',
    hash: '',
    data: routes,
  } as Route

  const router = {
    getUrl: () => '/',
    match: () => matched,
    listen: () => () => {},
    href: () => '/',
    navigate: () => {},
  }

  const html = renderToString(
    <RouterContext.Provider
      value={
        {
          router,
          route: null,
          navigate: () => {},
          isPending: false,
          pending: null,
          qs: undefined,
        } as any
      }
    >
      <Routes routes={routes} />
    </RouterContext.Provider>,
  )

  t.is(html, '<div>Home</div>')
  // Prepare runs during the first render — before segment components read
  // from the data cache — so cold direct loads suspend on prepared data.
  t.is(prepareCalls, 1)
})

test.serial('direct load renders routes whose components read prepared data', async (t) => {
  setup()
  g.location.href = '/profile'
  g.location.pathname = '/profile'

  const root = document.getElementById('root')

  // A strict fetch-as-you-render data layer: read() throws an Error (not a
  // promise) if the key was never prepared.
  const cache = new Map<string, { promise: Promise<void> | null; value: string | null }>()
  const prepareKey = (key: string): PreparedHandle[] => {
    let entry = cache.get(key)
    if (!entry) {
      const e: { promise: Promise<void> | null; value: string | null } = { promise: null, value: null }
      e.promise = Promise.resolve().then(() => {
        e.value = 'ready'
        e.promise = null
      })
      cache.set(key, e)
      entry = e
    }
    return [{ promise: entry.promise ?? Promise.resolve(), release: () => {} }]
  }
  const readKey = (key: string): string => {
    const entry = cache.get(key)
    if (!entry) throw new Error(`read("${key}") called before prepare`)
    if (entry.promise) throw entry.promise
    return entry.value!
  }

  function Profile() {
    return <div>{readKey('profile')}</div>
  }

  const routes = [{ path: '/profile', prepare: () => prepareKey('profile'), component: Profile }]

  function App() {
    return (
      <Router sync>
        <Suspense fallback={null}>
          <Routes routes={routes} />
        </Suspense>
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>ready</div></div>')
})

test.serial('initial route prepare stays leak-free under StrictMode double rendering', async (t) => {
  setup()

  const root = document.getElementById('root')
  let prepareCalls = 0
  let releaseCalls = 0

  const routes = [
    {
      path: '/',
      prepare: (): PreparedHandle[] => {
        prepareCalls++
        return [{ promise: Promise.resolve(), release: () => releaseCalls++ }]
      },
      component: () => <div>Home</div>,
    },
    { path: '/next', component: () => <div>Next</div> },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <StrictMode>
        <Router sync>
          <Capture />
          <Routes routes={routes} />
        </Router>
      </StrictMode>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Home</div></div>')

  await act(async () => {
    router.navigate('/next')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Next</div></div>')
  // Every prepared handle set was eventually released — the double render
  // reused one prepare, and no handles leaked through the StrictMode
  // mount/unmount/remount cycle.
  t.is(releaseCalls, prepareCalls)
  t.true(prepareCalls >= 1)
})

test.serial('Routes seeds the initial route synchronously for route components', async (t) => {
  setup()

  const root = document.getElementById('root')

  function Home() {
    const route = useRoute()
    return <div>route={route?.pathname ?? 'null'}</div>
  }

  function App() {
    return (
      <Router>
        <Routes routes={[{ path: '/', component: Home }]} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>route=/</div></div>')

  await act(async () => {
    await Promise.resolve()
  })
})

test.serial('Routes resolves ESM-default components and skips null components', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: ({ children }) => <section>{children}</section>,
      routes: [
        // simulates a dynamically imported module: { default: Component }
        { path: '/esm', component: { default: () => <div>ESM</div> } },
        // null component renders nothing for this segment
        { path: '/empty', component: null },
      ],
    },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync>
        <Capture />
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  act(() => {
    router.navigate('/esm')
  })
  t.is(window.document.body.innerHTML, '<div id="root"><section><div>ESM</div></section></div>')

  act(() => {
    router.navigate('/empty')
  })
  t.is(window.document.body.innerHTML, '<div id="root"><section></section></div>')
})

test.serial('Routes resolves lazy resolver components', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolverCalls = 0

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      path: '/lazy',
      resolver: () => {
        resolverCalls++
        return Promise.resolve({ default: () => <div>Lazy</div> })
      },
    },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync>
        <Capture />
        <Suspense fallback={<div>Loading</div>}>
          <Routes routes={routes} />
        </Suspense>
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    router.navigate('/lazy')
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Lazy</div></div>')
  t.is(resolverCalls, 1)

  await act(async () => {
    router.navigate('/')
  })
  await act(async () => {
    router.navigate('/lazy')
    await Promise.resolve()
  })

  t.is(resolverCalls, 1, 'resolver result is cached by function reference')
})

test.serial('Routes observes rejected resolver preload promises', async (t) => {
  setup()

  const root = document.getElementById('root')
  const originalConsoleError = console.error
  console.error = () => {}

  class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    render() {
      return this.state.hasError ? <div>Error</div> : this.props.children
    }
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      path: '/broken',
      resolver: () => Promise.reject(new Error('broken import')),
    },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync>
        <Capture />
        <ErrorBoundary>
          <Suspense fallback={<div>Loading</div>}>
            <Routes routes={routes} />
          </Suspense>
        </ErrorBoundary>
      </Router>
    )
  }

  try {
    await act(async () => {
      const r = ReactDOM.createRoot(root)
      r.render(<App />)
    })

    await act(async () => {
      router.navigate('/broken')
      await Promise.resolve()
      await Promise.resolve()
    })

    t.is(window.document.body.innerHTML, '<div id="root"><div>Error</div></div>')
  } finally {
    console.error = originalConsoleError
  }
})

test.serial('Routes pins prepare handles for the committed nav and releases on the next', async (t) => {
  setup()

  const root = document.getElementById('root')

  const released: string[] = []
  let nextHandleId = 0

  function makeHandle(label: string): PreparedHandle {
    const key = `${label}#${++nextHandleId}`
    return {
      key,
      promise: new Promise<void>(() => {}),
      release() {
        released.push(key)
      },
    }
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/a', component: () => <div>A</div>, prepare: () => [makeHandle('a')] },
    { path: '/b', component: () => <div>B</div>, prepare: () => [makeHandle('b')] },
    { path: '/c', component: () => <div>C</div>, prepare: () => [makeHandle('c')] },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync mode='memory'>
        <Capture />
        <Routes routes={routes} />
      </Router>
    )
  }

  let rootHandle
  await act(async () => {
    rootHandle = ReactDOM.createRoot(root)
    rootHandle.render(<App />)
  })

  await act(async () => {
    router.navigate('/a')
  })

  t.deepEqual(released, [], '/a pinned, nothing released yet')

  await act(async () => {
    router.navigate('/b')
  })

  t.true(
    released.some((k) => k.startsWith('a#')),
    '/a released when /b committed',
  )
  t.false(
    released.some((k) => k.startsWith('b#')),
    '/b still pinned',
  )

  await act(async () => {
    router.navigate('/c')
  })

  t.true(
    released.some((k) => k.startsWith('b#')),
    '/b released when /c committed',
  )

  await act(async () => {
    rootHandle.unmount()
  })

  t.true(
    released.some((k) => k.startsWith('c#')),
    '/c released on unmount',
  )
})

test.serial('Routes keeps current prepare handles pinned until a suspended navigation commits', async (t) => {
  setup()

  const root = document.getElementById('root')

  const released: string[] = []
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function makeHandle(label: string): PreparedHandle {
    return {
      key: label,
      promise: Promise.resolve(),
      release() {
        released.push(label)
      },
    }
  }

  function Slow() {
    if (!(Slow as any).ready) {
      throw slowGate.then(() => {
        ;(Slow as any).ready = true
      })
    }
    return <div>Slow</div>
  }

  const routes = [
    { path: '/', component: () => <div>Home</div>, prepare: () => [makeHandle('home')] },
    { path: '/slow', component: Slow, prepare: () => [makeHandle('slow')] },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync>
        <Capture />
        <Routes routes={routes} />
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
  t.false(released.includes('home'), 'home handle stays pinned while old route remains committed')

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Slow</div></div>')
  t.true(released.includes('home'), 'home handle releases after /slow commits')
  t.false(released.includes('slow'), 'slow handle remains pinned after /slow commits')
})

test.serial('Routes releases superseded pending handles and ignores release errors', async (t) => {
  setup()

  const root = document.getElementById('root')

  const released: string[] = []
  let resolveA: (() => void) | null = null
  const gateA = new Promise<void>((r) => {
    resolveA = r
  })
  let resolveB: (() => void) | null = null
  const gateB = new Promise<void>((r) => {
    resolveB = r
  })

  function makeSlow(label: string, gate: Promise<void>) {
    function Slow() {
      if (!(Slow as any).ready) {
        throw gate.then(() => {
          ;(Slow as any).ready = true
        })
      }
      return <div>{label}</div>
    }
    return Slow
  }

  const SlowA = makeSlow('A', gateA)
  const SlowB = makeSlow('B', gateB)

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      path: '/a',
      component: SlowA,
      prepare: () => [
        {
          promise: Promise.resolve(),
          release() {
            released.push('a')
            throw new Error('ignored')
          },
        },
      ],
    },
    {
      path: '/b',
      component: SlowB,
      prepare: () => [
        {
          promise: Promise.resolve(),
          release() {
            released.push('b')
          },
        },
      ],
    },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync>
        <Capture />
        <Routes routes={routes} />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    router.navigate('/a')
  })
  await act(async () => {
    router.navigate('/b')
  })

  t.deepEqual(released, ['a'])

  await act(async () => {
    resolveA!()
    resolveB!()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>B</div></div>')
  t.false(released.includes('b'))
})

test.serial('Routes releases pending handles when navigation returns to the committed route', async (t) => {
  setup()

  const root = document.getElementById('root')
  const released: string[] = []
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function Slow() {
    if (!(Slow as any).ready) {
      throw slowGate.then(() => {
        ;(Slow as any).ready = true
      })
    }
    return <div>Slow</div>
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      path: '/slow',
      component: Slow,
      prepare: () => [
        {
          promise: Promise.resolve(),
          release() {
            released.push('slow')
          },
        },
      ],
    },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    return (
      <Router sync>
        <Capture />
        <Routes routes={routes} />
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
    router.navigate('/')
  })

  t.deepEqual(released, ['slow'])

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Home</div></div>')
})
