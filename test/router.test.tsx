import test from 'ava'
import { act, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { JSDOM, VirtualConsole } from 'jsdom'
import {
  Router,
  RouterContext,
  Routes,
  Link,
  Navigate,
  useInternalRouterInstance,
  useLinkProps,
  usePending,
  useRoute,
  qs,
  type PreparedHandle,
  type Route,
} from '../src/index.tsx'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const g = globalThis as any

function setup() {
  const virtualConsole = new VirtualConsole()
  virtualConsole.forwardTo(console, { jsdomErrors: 'none' })
  virtualConsole.on('jsdomError', (error) => {
    if (error.type === 'not-implemented' && error.message === 'Not implemented: navigation to another Document') {
      return
    }
    if (error.type === 'unhandled-exception') {
      console.error(error.cause.stack)
      return
    }
    console.error(error.message)
  })

  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost/',
    virtualConsole,
  })
  g.window = dom.window
  g.window.scrollTo = () => {}
  g.document = dom.window.document
  g.history = {
    pushState(_state: unknown, _title: string, url: string) {
      g.location.href = url
      g.location.pathname = url

      const popstate = new dom.window.PopStateEvent('popstate')
      dom.window.dispatchEvent(popstate)
    },
    replaceState() {
      // no-op for tests; real replaceState would update the address bar
    },
  }
  g.location = {
    href: '/',
    pathname: '/',
    search: '',
    hash: '',
  }
}

function dispatchClick(el: Element): MouseEvent {
  const event = new window.MouseEvent('click', { bubbles: true, button: 0, cancelable: true })
  el.dispatchEvent(event)
  return event
}

test.serial('usage', async function (t) {
  setup()

  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: Home },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  let router

  function Home() {
    return (
      <div>
        <Link to='/stuff'>Stuff</Link>Hello
      </div>
    )
  }

  function InitialNav() {
    const _router = useInternalRouterInstance()

    useEffect(() => {
      router = _router
    }, [])

    return null
  }

  function App() {
    return (
      <Router sync>
        <InitialNav />
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(
    window.document.body.innerHTML,
    '<div id="root"><div><a aria-current="page" to="/stuff" href="/">Stuff</a>Hello</div></div>',
  )

  act(() => {
    router.navigate('/stuff')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Stuff</div></div>')
})

test.serial('useLinkProps()', async function (t) {
  setup()

  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: () => <Navigate to='/stuff' /> },
    { path: '/stuff', component: Stuff },
  ]

  let linkProps

  function Stuff() {
    const _linkProps = useLinkProps('/stuff')
    useEffect(() => {
      linkProps = _linkProps
    }, [])

    return <div>Stuff</div>
  }

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.deepEqual(linkProps, {
    'aria-current': 'page',
    href: '/stuff',
    onClick: linkProps.onClick,
  })
  t.is(typeof linkProps.onClick, 'function')
  t.true(linkProps.isCurrent)
  t.false(linkProps.isPending)
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

test('qs', async (t) => {
  t.is(qs.stringify({ a: 1 }), 'a=1')
  t.deepEqual(qs.parse('a=1'), { a: '1' })
})

test.serial('useInternalRouterInstance throws outside Router', (t) => {
  setup()

  const root = document.getElementById('root')

  function NoRouter() {
    useInternalRouterInstance()
    return null
  }

  function App() {
    return (
      <RouterContext.Provider value={undefined}>
        <NoRouter />
      </RouterContext.Provider>
    )
  }

  const originalConsoleError = console.error
  console.error = () => {}

  try {
    t.throws(
      () => {
        act(() => {
          const r = ReactDOM.createRoot(root)
          r.render(<App />)
        })
      },
      { message: /Application must be wrapped in <Router \/>/ },
    )
  } finally {
    console.error = originalConsoleError
  }
})

test.serial('Link click navigates and invokes to.onClick', (t) => {
  setup()

  const root = document.getElementById('root')
  let onClickCalls = 0

  const routes = [
    {
      path: '/',
      component: () => (
        <div>
          <Link href='/stuff'>StringHref</Link>
          <Link href='/stuff' onClick={() => onClickCalls++}>
            ObjectHref
          </Link>
        </div>
      ),
    },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  const [stringLink, objectLink] = window.document.querySelectorAll('a')

  act(() => {
    objectLink.click()
  })

  t.is(onClickCalls, 1)
  t.is(window.document.body.innerHTML, '<div id="root"><div>Stuff</div></div>')

  // also exercise the string-href Link path (re-render home first)
  act(() => {
    history.pushState({}, '', '/')
  })

  act(() => {
    const newStringLink = window.document.querySelector('a')
    newStringLink.click()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Stuff</div></div>')

  // sanity: stringLink reference is from before the re-render and detached now
  t.truthy(stringLink)
})

test.serial('Link composes user onClick before internal navigation', (t) => {
  setup()

  const root = document.getElementById('root')
  let onClickCalls = 0

  const routes = [
    {
      path: '/',
      component: () => (
        <Link
          href='/stuff'
          onClick={(event) => {
            onClickCalls++
            event.preventDefault()
          }}
        >
          Blocked
        </Link>
      ),
    },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  act(() => {
    window.document.querySelector('a')!.click()
  })

  t.is(onClickCalls, 1)
  t.is(location.pathname, '/')
})

test.serial('transformRoute rewrites the route before commit and syncs the URL', async (t) => {
  setup()

  const root = document.getElementById('root')
  let preparedStatus
  let preparedUrl

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      path: '/people',
      prepare: ({ query, url }) => {
        preparedStatus = query.status
        preparedUrl = url
      },
      component: () => {
        const r = useRoute()
        return <div data-testid='people'>status={String(r?.query?.status ?? 'none')}</div>
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

  // Simulate persisted-query restoration: if /people has no `status`, inject one.
  function transformRoute(route: Route): Route | void {
    if (route.pathname === '/people' && !(route as any).query?.status) {
      const query = { ...(route as any).query, status: 'active' }
      const search = '?status=active'
      return { ...route, query, search, url: '/people' + search } as Route
    }
  }

  function App() {
    return (
      <Router sync transformRoute={transformRoute}>
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
    router.navigate('/people')
  })

  t.regex(window.document.body.innerHTML, /status=active/)
  t.is(preparedStatus, 'active')
  t.is(preparedUrl, '/people?status=active')
})

test.serial('transformRoute applies before initial route prepare', async (t) => {
  setup()
  history.pushState({}, '', '/people')

  const root = document.getElementById('root')
  let preparedStatus
  let preparedUrl

  const routes = [
    {
      path: '/people',
      prepare: ({ query, url }) => {
        preparedStatus = query.status
        preparedUrl = url
      },
      component: () => {
        const r = useRoute()
        return <div>status={String(r?.query?.status ?? 'none')}</div>
      },
    },
  ]

  function transformRoute(route: Route): Route | void {
    if (route.pathname === '/people' && !(route as any).query?.status) {
      const query = { ...(route as any).query, status: 'active' }
      const search = '?status=active'
      return { ...route, query, search, url: '/people' + search } as Route
    }
  }

  function App() {
    return (
      <Router sync transformRoute={transformRoute}>
        <Routes routes={routes} />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.regex(window.document.body.innerHTML, /status=active/)
  t.is(preparedStatus, 'active')
  t.is(preparedUrl, '/people?status=active')
})

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
    const r = useInternalRouterInstance()
    const pending = usePending()
    pendingSamples.push(pending)
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

test.serial('Link honours current override and regular className/style props', (t) => {
  setup()

  const routes = [
    {
      path: '/',
      component: () => (
        <div>
          <Link href='/stuff' current={true} className='on' style={{ color: 'red' }} data-active='yes'>
            Forced
          </Link>
          <Link href='/stuff' current={false}>
            Disabled
          </Link>
        </div>
      ),
    },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  const root = document.getElementById('root')
  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  const [forced, disabled] = window.document.querySelectorAll('a')
  t.is(forced.getAttribute('aria-current'), 'page')
  t.is(forced.getAttribute('class'), 'on')
  t.is(forced.getAttribute('style'), 'color: red;')
  t.is(forced.getAttribute('data-active'), 'yes')
  t.is(disabled.getAttribute('aria-current'), null)
})

test.serial('useLinkProps exposes per-link pending state', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function Home() {
    const slowLink = useLinkProps('/slow')
    const otherLink = useLinkProps('/other')
    return (
      <div>
        <a
          href={slowLink.href}
          onClick={slowLink.onClick}
          data-current={String(slowLink.isCurrent)}
          data-pending={String(slowLink.isPending)}
        >
          Slow
        </a>
        <span data-current-other={String(otherLink.isCurrent)} />
        <span data-pending-other={String(otherLink.isPending)} />
      </div>
    )
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
    { path: '/', component: Home },
    { path: '/slow', component: Slow },
    { path: '/other', component: () => <div>Other</div> },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    window.document.querySelector('a')!.click()
  })

  t.is(window.document.querySelector('a')?.getAttribute('data-pending'), 'true')
  t.is(window.document.querySelector('a')?.getAttribute('data-current'), 'false')
  t.is(window.document.querySelector('[data-current-other]')?.getAttribute('data-current-other'), 'false')
  t.is(window.document.querySelector('[data-pending-other]')?.getAttribute('data-pending-other'), 'false')

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Slow</div></div>')
})

test.serial('Link rendered alongside Routes in async mode does not crash', async (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [{ path: '/', component: () => <div>Home</div> }]

  function App() {
    return (
      <Router>
        <Link href='/somewhere'>Nav</Link>
        <Routes routes={routes} />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  // before the bug fix this crashed during render with "Cannot read properties of null (reading 'pathname')"
  const link = window.document.querySelector('a')
  t.is(link?.getAttribute('href'), '/somewhere')
  t.is(link?.getAttribute('aria-current'), null)
})

test.serial('Routes passes children through when a middle segment has no component', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: ({ children }) => <section>{children}</section>,
      routes: [
        {
          // middle segment with no component — should be transparent, not block descendants
          routes: [{ path: '/inner', component: () => <article>Inner</article> }],
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

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  act(() => {
    router.navigate('/inner')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><section><article>Inner</article></section></div>')
})

test.serial('Routes injects path params as component props', (t) => {
  setup()

  const root = document.getElementById('root')

  function Item({ id }: { id?: string }) {
    return <div>item={id ?? 'missing'}</div>
  }

  const routes = [{ path: '/items/:id', component: Item }]

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
    router.navigate('/items/beacon')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>item=beacon</div></div>')
})

test.serial('Link with target=_blank lets the browser open in a new tab', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => (
        <Link href='/foo' target='_blank'>
          NewTab
        </Link>
      ),
    },
    { path: '/foo', component: () => <div>Foo</div> },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  const link = window.document.querySelector('a')!
  let event: MouseEvent
  act(() => {
    event = dispatchClick(link)
  })

  // navigation should NOT have happened — the browser handles target=_blank
  t.false(event!.defaultPrevented)
  t.is(location.pathname, '/')
})

test.serial('Link with cross-origin URL lets the browser handle it', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => <Link href='https://example.com/foo'>External</Link>,
    },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  const link = window.document.querySelector('a')!
  let event: MouseEvent
  act(() => {
    event = dispatchClick(link)
  })

  // SPA navigation should be skipped for cross-origin URLs
  t.false(event!.defaultPrevented)
  t.is(location.pathname, '/')
})

test.serial('Link with download attribute lets the browser handle it', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => (
        <Link href='/file.pdf' download>
          Download
        </Link>
      ),
    },
  ]

  function App() {
    return (
      <Router sync>
        <Routes routes={routes} />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  const link = window.document.querySelector('a')!
  let event: MouseEvent
  act(() => {
    event = dispatchClick(link)
  })

  t.false(event!.defaultPrevented)
  t.is(location.pathname, '/')
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

test.serial('Router recreates router when mode prop changes', (t) => {
  setup()

  const root = document.getElementById('root')
  const seenRouters = new Set()

  function Capture() {
    const r = useInternalRouterInstance()
    seenRouters.add(r)
    return null
  }

  let setMode

  function App() {
    const [mode, _setMode] = useState('history')
    setMode = _setMode
    return (
      <Router sync mode={mode}>
        <Capture />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(seenRouters.size, 1)

  act(() => {
    setMode('memory')
  })

  t.is(seenRouters.size, 2)
})
