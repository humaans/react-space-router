import test from 'ava'
import React, { act, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { JSDOM } from 'jsdom'
import {
  Router,
  RouterContext,
  Routes,
  Link,
  Navigate,
  useInternalRouterInstance,
  useLinkProps,
  qs,
} from '../src/index.jsx'

global.IS_REACT_ACT_ENVIRONMENT = true

function setup() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  global.window = dom.window
  global.window.scrollTo = () => {}
  global.document = dom.window.document
  global.history = {
    pushState(state, title, url) {
      global.location.href = url
      global.location.pathname = url

      const popstate = new dom.window.PopStateEvent('popstate')
      dom.window.dispatchEvent(popstate)
    },
  }
  global.location = {
    href: '/',
    pathname: '/',
    search: '',
    hash: '',
  }
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
    '<div id="root"><div><a aria-current="page" to="/stuff" href="/">Stuff</a>Hello</div></div>'
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
      <RouterContext.Provider value={{}}>
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
      { message: /Application must be wrapped in <Router \/>/ }
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
          <Link href={{ url: '/stuff', onClick: () => onClickCalls++ }}>ObjectHref</Link>
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

test.serial('onNavigating is awaited before onNavigated', async (t) => {
  setup()

  const root = document.getElementById('root')
  const events = []

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/stuff', component: () => <div>Stuff</div> },
  ]

  let router

  function Capture() {
    const r = useInternalRouterInstance()
    useEffect(() => {
      router = r
    }, [r])
    return null
  }

  async function onNavigating(route) {
    events.push(`navigating:${route.pathname}`)
    await Promise.resolve()
  }

  function onNavigated(route) {
    events.push(`navigated:${route.pathname}`)
  }

  function App() {
    return (
      <Router sync onNavigating={onNavigating} onNavigated={onNavigated}>
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
    router.navigate('/stuff')
  })

  t.true(events.includes('navigating:/stuff'))
  t.true(events.includes('navigated:/stuff'))
  t.is(events.indexOf('navigating:/stuff') < events.indexOf('navigated:/stuff'), true)
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
