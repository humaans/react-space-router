// Core <Router>/<Routes> behavior: context wiring, rendering and param
// injection, transformRoute, route map changes, and router options.
import test from 'ava'
import { act, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { Router, Routes, Link, Navigate, useNavigate, useSpaceRouter, useRoute, qs, type Route } from '../src/index.tsx'
import { g, setup } from './helpers.ts'

test.serial('usage', async function (t) {
  setup()

  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: Home },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  let router
  let routeOutsideRoutes: Route | null = null

  function Home() {
    return (
      <div>
        <Link href='/stuff'>Stuff</Link>Hello
      </div>
    )
  }

  function InitialNav() {
    const _router = useSpaceRouter()
    routeOutsideRoutes = useRoute()

    useEffect(() => {
      router = _router
    }, [])

    return null
  }

  function App() {
    return (
      <Router sync routes={routes}>
        <InitialNav />
        <Routes />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div><a href="/stuff">Stuff</a>Hello</div></div>')
  t.is(routeOutsideRoutes?.url, '/')

  act(() => {
    router.navigate('/stuff')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>Stuff</div></div>')
})

test.serial('Router and Link render without browser globals', (t) => {
  const previous = {
    window: g.window,
    document: g.document,
    history: g.history,
    location: g.location,
  }

  delete g.window
  delete g.document
  delete g.history
  delete g.location

  try {
    const html = renderToString(
      <Router routes={[{ path: '/', component: () => <div>Home</div> }]}>
        <Link href='/x'>X</Link>
        <Routes />
      </Router>,
    )

    t.is(html, '<a href="/x">X</a>')
  } finally {
    g.window = previous.window
    g.document = previous.document
    g.history = previous.history
    g.location = previous.location
  }
})

test.serial('Navigate follows to prop changes while mounted', async (t) => {
  setup()

  const root = document.getElementById('root')
  let setTarget

  const routes = [
    { path: '/a', component: () => <div>A</div> },
    { path: '/b', component: () => <div>B</div> },
  ]

  function App() {
    const [target, _setTarget] = useState('/a')
    setTarget = _setTarget
    return (
      <Router sync routes={routes}>
        <Navigate to={{ url: target }} />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>A</div></div>')

  await act(async () => {
    setTarget('/b')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>B</div></div>')
})

test('qs', async (t) => {
  t.is(qs.stringify({ a: 1 }), 'a=1')
  t.deepEqual(qs.parse('a=1'), { a: '1' })
})

test.serial('useSpaceRouter throws outside Router', (t) => {
  setup()

  const root = document.getElementById('root')

  function NoRouter() {
    useSpaceRouter()
    return null
  }

  const originalConsoleError = console.error
  console.error = () => {}

  try {
    t.throws(
      () => {
        act(() => {
          const r = ReactDOM.createRoot(root)
          r.render(<NoRouter />)
        })
      },
      { message: /Application must be wrapped in <Router \/>/ },
    )
  } finally {
    console.error = originalConsoleError
  }
})

test.serial('useRoute throws outside Router', (t) => {
  setup()

  const root = document.getElementById('root')

  function NoRouter() {
    useRoute()
    return null
  }

  const originalConsoleError = console.error
  console.error = () => {}

  try {
    t.throws(
      () => {
        act(() => {
          const r = ReactDOM.createRoot(root)
          r.render(<NoRouter />)
        })
      },
      { message: /Application must be wrapped in <Router \/>/ },
    )
  } finally {
    console.error = originalConsoleError
  }
})

test.serial('useRoute throws when the current URL is unmatched', (t) => {
  setup()

  function UnmatchedRouteConsumer() {
    useRoute()
    return null
  }

  const error = t.throws(() =>
    renderToString(
      <Router routes={[{ path: '/matched', component: () => null }]}>
        <UnmatchedRouteConsumer />
      </Router>,
    ),
  )

  t.regex(error.message, /useRoute\(\) requires a matched route/)
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
    const r = useSpaceRouter()
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
      <Router sync transformRoute={transformRoute} routes={routes}>
        <Capture />
        <Routes />
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

test.serial('navigation coalesces only consecutive identical outstanding requests from one route', async (t) => {
  setup()

  const root = document.getElementById('root')
  const pushed: string[] = []
  const originalPushState = history.pushState
  let navigate
  let router
  const navigateReferences: unknown[] = []

  history.pushState = (state: unknown, title: string, url: string) => {
    pushed.push(url)
    originalPushState.call(history, state, title, url)
  }

  function Capture() {
    navigate = useNavigate()
    router = useSpaceRouter()
    navigateReferences.push(navigate)
    return null
  }

  try {
    await act(async () => {
      const r = ReactDOM.createRoot(root)
      r.render(
        <Router
          sync
          routes={[
            { path: '/', component: () => <div>Home</div> },
            { path: '/a', component: () => <div>A</div> },
            { path: '/b', component: () => <div>B</div> },
          ]}
        >
          <Capture />
          <Routes />
        </Router>,
      )
    })
    const initialNavigate = navigate

    await act(async () => {
      navigate('/a')
      navigate('/a')
      navigate('/a')
    })
    t.deepEqual(pushed, ['/a'])
    t.is(window.document.body.textContent, 'A')

    // A committed same-URL navigation is intentional and remains allowed.
    await act(async () => {
      navigate('/a')
    })
    t.deepEqual(pushed, ['/a', '/a'])

    // A callback captured on the initial route remains stable, but merge is
    // resolved from the latest committed route rather than that old closure.
    await act(async () => {
      initialNavigate({ query: { scope: 'team' }, merge: true })
    })
    t.deepEqual(pushed, ['/a', '/a', '/a?scope=team'])

    // An intervening target makes A -> B -> A two distinct requests, even
    // before either one has committed. The public router follows the same
    // guarded path as useNavigate, Link, and Navigate.
    await act(async () => {
      router.navigate('/b')
      router.navigate('/a')
    })
    t.deepEqual(pushed, ['/a', '/a', '/a?scope=team', '/b', '/a'])
    t.is(window.document.body.textContent, 'A')

    // Unmatched targets cannot commit, so their short-lived guard is cleared
    // and the same request can be retried.
    await act(async () => {
      navigate('/missing')
    })
    await act(async () => {
      navigate('/missing')
    })
    t.deepEqual(pushed, ['/a', '/a', '/a?scope=team', '/b', '/a', '/missing', '/missing'])

    t.true(navigateReferences.every((reference) => reference === navigateReferences[0]))
  } finally {
    history.pushState = originalPushState
  }
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
      <Router sync transformRoute={transformRoute} routes={routes}>
        <Routes />
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

test.serial('transformRoute syncs the URL behind the # in hash mode', async (t) => {
  setup()
  // The app lives at /app?embed=1; the route url lives in the fragment.
  g.location.pathname = '/app'
  g.location.search = '?embed=1'
  g.location.hash = '#/people'

  const replaceStateCalls: string[] = []
  g.history.replaceState = (_state: unknown, _title: string, url: string) => {
    replaceStateCalls.push(url)
  }

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/people',
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
      <Router sync mode='hash' transformRoute={transformRoute} routes={routes}>
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.regex(window.document.body.innerHTML, /status=active/)
  // The sync wrote a bare fragment url — the page's pathname and search are
  // left for the browser to preserve, and the route url stays behind the #.
  t.deepEqual(replaceStateCalls, ['#/people?status=active'])
})

test.serial('transformRoute leaves browser history untouched in memory mode', async (t) => {
  setup()

  const replaceStateCalls: string[] = []
  g.history.replaceState = (_state: unknown, _title: string, url: string) => {
    replaceStateCalls.push(url)
  }

  const root = document.getElementById('root')
  let router

  function Capture() {
    const r = useSpaceRouter()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      path: '/people',
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
      <Router sync mode='memory' transformRoute={transformRoute} routes={routes}>
        <Capture />
        <Routes />
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
  // The sync stayed inside the router's memory stack...
  t.is(router.getUrl(), '/people?status=active')
  // ...and never touched real browser history.
  t.deepEqual(replaceStateCalls, [])
})

test.serial('Routes passes children through when a middle segment has no component', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
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
    const r = useSpaceRouter()
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
    const r = useSpaceRouter()
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

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  act(() => {
    router.navigate('/items/beacon')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>item=beacon</div></div>')
})

test.serial('Routes parses query hash splat optional params and wildcard routes', (t) => {
  setup()

  const root = document.getElementById('root')

  function Inspector() {
    const route = useRoute()
    return (
      <div>
        path={route.pathname}; params={JSON.stringify(route.params)}; query={JSON.stringify(route.query)}; hash=
        {route.hash}
      </div>
    )
  }

  const routes = [
    { path: '/files/:path+', component: Inspector },
    { path: '/needs/:id+', component: Inspector },
    { path: '/optional/:id?', component: Inspector },
    { path: '*', component: Inspector },
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
      <Router sync mode='memory' routes={routes}>
        <Capture />
        <Routes />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  act(() => {
    router.navigate('/files/a/b?q=1#top')
  })

  t.regex(window.document.body.innerHTML, /path=\/files\/a\/b/)
  t.regex(window.document.body.innerHTML, /"path":"a\/b"/)
  t.regex(window.document.body.innerHTML, /"q":"1"/)
  t.regex(window.document.body.innerHTML, /hash=#top/)

  act(() => {
    router.navigate('/needs')
  })

  t.regex(window.document.body.innerHTML, /path=\/needs/)
  t.notRegex(window.document.body.innerHTML, /"id":/)

  act(() => {
    router.navigate('/optional')
  })

  t.regex(window.document.body.innerHTML, /"id":""/)

  act(() => {
    router.navigate('/anything-else')
  })

  t.regex(window.document.body.innerHTML, /path=\/anything-else/)
})

test.serial('Router rematches the current URL when the route map changes in memory mode', async (t) => {
  setup()

  const root = document.getElementById('root')
  let router
  let setRoutes

  function Capture() {
    const r = useSpaceRouter()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  function App() {
    const [routes, _setRoutes] = useState<RouteDefinition[]>([{ path: '/swap', component: () => <div>A</div> }])
    setRoutes = _setRoutes
    return (
      <Router sync mode='memory' routes={routes}>
        <Capture />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    router.navigate('/swap')
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>A</div></div>')

  await act(async () => {
    setRoutes([{ path: '/swap', component: () => <div>B</div> }])
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>B</div></div>')

  await act(async () => {
    setRoutes([])
  })

  t.is(window.document.body.innerHTML, '<div id="root"></div>')

  await act(async () => {
    setRoutes([{ path: '/swap', component: () => <div>C</div> }])
  })

  t.is(window.document.body.innerHTML, '<div id="root"><div>C</div></div>')
})

test.serial('Router prepares a route-map update once in history mode', async (t) => {
  setup()
  g.location.href = '/swap'
  g.location.pathname = '/swap'

  const root = document.getElementById('root')
  const prepared: string[] = []
  const released: string[] = []
  let setRoutes

  const makeRoutes = (label: string) => [
    {
      path: '/swap',
      component: () => <div>{label}</div>,
      prepare: () => {
        prepared.push(label)
        return [
          {
            promise: Promise.resolve(),
            release: () => released.push(label),
          },
        ]
      },
    },
  ]

  function App() {
    const [routes, _setRoutes] = useState(makeRoutes('A'))
    setRoutes = _setRoutes
    return (
      <Router sync routes={routes}>
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(<App />)
  })

  await act(async () => {
    setRoutes(makeRoutes('B'))
  })

  t.deepEqual(prepared, ['A', 'B'])
  t.deepEqual(released, ['A'])
  t.is(window.document.body.innerHTML, '<div id="root"><div>B</div></div>')

  await act(async () => {
    setRoutes([])
  })

  t.deepEqual(prepared, ['A', 'B'])
  t.deepEqual(released, ['A', 'B'])
  t.is(window.document.body.innerHTML, '<div id="root"></div>')

  await act(async () => {
    setRoutes(makeRoutes('C'))
  })

  t.deepEqual(prepared, ['A', 'B', 'C'])
  t.deepEqual(released, ['A', 'B'])
  t.is(window.document.body.innerHTML, '<div id="root"><div>C</div></div>')
})

test.serial('Router recreates router when mode prop changes', (t) => {
  setup()

  const root = document.getElementById('root')
  const seenRouters = new Set()
  const routes = []

  function Capture() {
    const r = useSpaceRouter()
    seenRouters.add(r)
    return null
  }

  let setMode

  function App() {
    const [mode, _setMode] = useState('history')
    setMode = _setMode
    return (
      <Router routes={routes} sync mode={mode}>
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
