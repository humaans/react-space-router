// Previous-route semantics: actual React commits, first destination render,
// same-URL commits, batched navigation, traversal, and route transforms.
import test from 'ava'
import { act, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { Router, Routes, usePreviousRoute, useRoute, useSpaceRouter, type Route } from '../src/index.tsx'
import { g, setup } from './helpers.ts'

test.serial('usePreviousRoute is available on the destination first render and counts same-URL commits', async (t) => {
  setup()
  history.pushState({}, '', '/a')

  const root = document.getElementById('root')
  let router
  let currentRoute: Route | null = null
  let previousRoute: Route | null = null

  function CaptureRouter() {
    router = useSpaceRouter()
    return null
  }

  function Page({ label }: { label: string }) {
    currentRoute = useRoute()
    previousRoute = usePreviousRoute()
    return <div>{`${label}:${currentRoute?.url} <- ${previousRoute?.url ?? 'none'}`}</div>
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        routes={[
          { path: '/a', component: () => <Page label='A' /> },
          { path: '/b', component: () => <Page label='B' /> },
        ]}
      >
        <CaptureRouter />
        <Routes />
      </Router>,
    )
  })

  const routeA = currentRoute
  t.is(window.document.body.textContent, 'A:/a <- none')
  t.is(previousRoute, null)

  await act(async () => {
    router.navigate('/b')
  })

  const firstRouteB = currentRoute
  t.is(window.document.body.textContent, 'B:/b <- /a')
  t.is(previousRoute, routeA)

  await act(async () => {
    router.navigate('/b')
  })

  t.is(window.document.body.textContent, 'B:/b <- /b')
  t.is(previousRoute, firstRouteB)
  t.not(currentRoute, firstRouteB)
})

test.serial('usePreviousRoute ignores batched destinations that never commit', async (t) => {
  setup()
  history.pushState({}, '', '/home')

  const root = document.getElementById('root')
  let router

  function CaptureRouter() {
    router = useSpaceRouter()
    return null
  }

  function Page() {
    const route = useRoute()
    const previous = usePreviousRoute()
    return <div>{`${route?.url} <- ${previous?.url ?? 'none'}`}</div>
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        routes={[
          { path: '/home', component: Page },
          { path: '/a', component: Page },
          { path: '/b', component: Page },
        ]}
      >
        <CaptureRouter />
        <Routes />
      </Router>,
    )
  })

  await act(async () => {
    router.navigate('/a')
    router.navigate('/b')
    router.navigate('/a')
  })

  t.is(window.document.body.textContent, '/a <- /home')
})

test.serial('a suspended destination superseded before commit never becomes previous', async (t) => {
  setup()
  history.pushState({}, '', '/home')

  const root = document.getElementById('root')
  let router
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((resolve) => {
    resolveSlow = resolve
  })
  let slowReady = false

  function CaptureRouter() {
    router = useSpaceRouter()
    const route = useRoute()
    const previous = usePreviousRoute()
    return <span>{`${route?.url} <- ${previous?.url ?? 'none'}`}</span>
  }

  function Slow() {
    if (!slowReady) {
      throw slowGate.then(() => {
        slowReady = true
      })
    }
    return <div>Slow</div>
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        routes={[
          { path: '/home', component: () => <div>Home</div> },
          { path: '/slow', component: Slow },
          { path: '/final', component: () => <div>Final</div> },
        ]}
      >
        <CaptureRouter />
        <Suspense fallback={<div>Fallback</div>}>
          <Routes />
        </Suspense>
      </Router>,
    )
  })

  await act(async () => {
    router.navigate('/slow')
  })
  t.true(window.document.body.textContent?.includes('/home <- none'))
  t.true(window.document.body.textContent?.includes('Home'))

  await act(async () => {
    router.navigate('/final')
  })
  t.true(window.document.body.textContent?.includes('/final <- /home'))
  t.true(window.document.body.textContent?.includes('Final'))

  await act(async () => {
    resolveSlow!()
    await Promise.resolve()
  })
  t.true(window.document.body.textContent?.includes('/final <- /home'))
})

test.serial('unmatched navigation clears current route without advancing successful history', async (t) => {
  setup()
  history.pushState({}, '', '/a')

  const root = document.getElementById('root')
  let router

  function AppState() {
    router = useSpaceRouter()
    const route = useRoute()
    const previous = usePreviousRoute()
    return <div>{`${route?.url} <- ${previous?.url ?? 'none'}`}</div>
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        routes={[
          { path: '/a', component: () => null },
          { path: '/b', component: () => null },
        ]}
      >
        <AppState />
        <Routes />
      </Router>,
    )
  })

  await act(async () => {
    router.navigate('/b')
  })
  t.is(window.document.body.textContent, '/b <- /a')

  await act(async () => {
    router.navigate('/missing')
  })
  t.is(window.document.body.textContent, 'undefined <- /a')
  t.is(router.match('/missing'), undefined)

  g.location.href = '/a'
  g.location.pathname = '/a'
  g.location.search = ''
  await act(async () => {
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })

  t.is(window.document.body.textContent, '/a <- /b')
})

test.serial('usePreviousRoute returns post-transform committed routes', async (t) => {
  setup()
  history.pushState({}, '', '/a')

  const root = document.getElementById('root')
  let router
  let previousRoute: Route | null = null

  function AppState() {
    router = useSpaceRouter()
    previousRoute = usePreviousRoute()
    return null
  }

  function transformRoute(route: Route): Route {
    const query = { ...route.query, transformed: route.pathname.slice(1) }
    const search = `?transformed=${route.pathname.slice(1)}`
    return { ...route, query, search, url: `${route.pathname}${search}` }
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        transformRoute={transformRoute}
        routes={[
          { path: '/a', component: () => null },
          { path: '/b', component: () => null },
        ]}
      >
        <AppState />
        <Routes />
      </Router>,
    )
  })

  await act(async () => {
    router.navigate('/b')
  })

  t.is(previousRoute?.url, '/a?transformed=a')
  t.deepEqual(previousRoute?.query, { transformed: 'a' })
})

test.serial('usePreviousRoute throws outside Router', (t) => {
  setup()

  const root = document.getElementById('root')
  const originalConsoleError = console.error
  console.error = () => {}

  function NoRouter() {
    usePreviousRoute()
    return null
  }

  try {
    t.throws(
      () => {
        act(() => {
          ReactDOM.createRoot(root).render(<NoRouter />)
        })
      },
      { message: /Application must be wrapped in <Router \/>/ },
    )
  } finally {
    console.error = originalConsoleError
  }
})
