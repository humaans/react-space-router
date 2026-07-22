// <Link> and useLinkProps: click handling, browser-delegated navigations,
// current/pending link state, and href composition.
import test from 'ava'
import { act, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Router,
  Routes,
  Link,
  Navigate,
  useSpaceRouter,
  useLinkProps,
  useLinkState,
  useNavigate,
} from '../src/index.tsx'
import { g, setup, dispatchClick } from './helpers.ts'

test.serial('useLinkProps()', async function (t) {
  setup()

  const root = document.getElementById('root')

  const routes = [
    { path: '/', component: () => <Navigate to='/stuff' /> },
    { path: '/stuff', component: Stuff },
  ]

  let linkProps
  let linkState

  function Stuff() {
    const _linkProps = useLinkProps('/stuff')
    const _linkState = useLinkState('/stuff')
    useEffect(() => {
      linkProps = _linkProps
      linkState = _linkState
    }, [])

    return <div>Stuff</div>
  }

  function App() {
    return (
      <Router sync routes={routes}>
        <Routes />
      </Router>
    )
  }

  act(() => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  t.deepEqual(linkProps, {
    'aria-current': 'page',
    'data-pending': undefined,
    href: '/stuff',
    onClick: linkProps.onClick,
  })
  t.is(typeof linkProps.onClick, 'function')
  t.deepEqual(linkState, { isCurrent: true, isPending: false })
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
      <Router sync routes={routes}>
        <Routes />
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

  // also exercise the string-href Link path (re-render home first, via a
  // simulated browser back)
  act(() => {
    history.pushState({}, '', '/')
    window.dispatchEvent(new window.PopStateEvent('popstate'))
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
      <Router sync routes={routes}>
        <Routes />
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
      <Router sync routes={routes}>
        <Routes />
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

test.serial('Link preserves replace and current from object href when props are omitted', (t) => {
  setup()

  const root = document.getElementById('root')
  let pushCalls = 0
  let replaceCalls = 0
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = (state: unknown, title: string, url: string) => {
    pushCalls++
    originalPushState.call(history, state, title, url)
  }
  history.replaceState = (_state: unknown, _title: string, url: string) => {
    replaceCalls++
    location.href = url
    location.pathname = url
    const popstate = new window.PopStateEvent('popstate')
    window.dispatchEvent(popstate)
  }

  const routes = [
    {
      path: '/',
      component: () => (
        <div>
          <Link href={{ pathname: '/next', replace: true }}>Next</Link>
          <Link href={{ pathname: '/next', current: true }}>Forced</Link>
          <Link href='/next' replace>
            PropReplace
          </Link>
        </div>
      ),
    },
    { path: '/next', component: () => <div>Next</div> },
  ]

  function App() {
    return (
      <Router sync routes={routes}>
        <Routes />
      </Router>
    )
  }

  try {
    act(() => {
      const r = ReactDOM.createRoot(root)
      r.render(<App />)
    })

    const [next, forced, propReplace] = window.document.querySelectorAll('a')
    t.is(forced.getAttribute('aria-current'), 'page')
    t.is(propReplace.getAttribute('href'), '/next')

    act(() => {
      next.click()
    })

    t.is(replaceCalls, 1)
    t.is(pushCalls, 0)
    t.is(window.document.body.innerHTML, '<div id="root"><div>Next</div></div>')
  } finally {
    history.pushState = originalPushState
    history.replaceState = originalReplaceState
  }
})

test.serial('useLinkProps and useLinkState expose per-link pending state', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function Home() {
    // `data-pending` arrives via the spread; `data-current` reads the state hook.
    const slowProps = useLinkProps('/slow')
    const slowState = useLinkState('/slow')
    const otherState = useLinkState('/other')
    return (
      <div>
        <a {...slowProps} data-current={String(slowState.isCurrent)}>
          Slow
        </a>
        <span data-current-other={String(otherState.isCurrent)} />
        <span data-pending-other={String(otherState.isPending)} />
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
      <Router sync routes={routes}>
        <Routes />
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

  t.is(window.document.querySelector('a')?.getAttribute('data-pending'), '')
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

test.serial('useLinkState matches pending and current state for hash-prefixed hrefs in hash mode', async (t) => {
  setup()
  // Hash-mode navigation goes through location.assign + a hashchange event;
  // the stubbed location doesn't implement either, so wire them up here.
  g.location.assign = (url: string) => {
    g.location.hash = url
    window.dispatchEvent(new window.Event('hashchange'))
  }

  const root = document.getElementById('root')
  let resolveSlow: (() => void) | null = null
  const slowGate = new Promise<void>((r) => {
    resolveSlow = r
  })

  function Home() {
    const navigate = useNavigate()
    const slowLink = useLinkState('#/slow')
    const otherLink = useLinkState('#/other')
    return (
      <div>
        <Link id='slow-link' href='/slow'>
          Slow
        </Link>
        <button onClick={() => navigate('/slow')}>Go</button>
        <span data-current={String(slowLink.isCurrent)} data-pending={String(slowLink.isPending)} />
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

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(
      <Router sync mode='hash' routes={routes}>
        <Routes />
      </Router>,
    )
  })

  t.is(window.document.querySelector('#slow-link')?.getAttribute('href'), '#/slow')

  await act(async () => {
    window.document.querySelector('button')!.click()
  })

  t.is(window.document.querySelector('span[data-pending]')?.getAttribute('data-pending'), 'true')
  t.is(window.document.querySelector('span[data-pending]')?.getAttribute('data-current'), 'false')
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
      <Router routes={routes}>
        <Link href='/somewhere'>Nav</Link>
        <Routes />
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

test.serial('Link remains usable when the current URL is unmatched', async (t) => {
  setup()
  history.pushState({}, '', '/missing')

  const root = document.getElementById('root')

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router routes={[{ path: '/', component: () => <div>Home</div> }]}>
        <Link href='/'>Home</Link>
        <Routes />
      </Router>,
    )
  })

  const link = window.document.querySelector('a')
  t.is(link?.getAttribute('href'), '/')
  t.is(link?.getAttribute('aria-current'), null)
})

test.serial('Link clears pending href when async navigation commits', async (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => <Link href='/next'>Next</Link>,
    },
    { path: '/next', component: () => <div>Next</div> },
  ]

  function PendingProbe() {
    const { isPending } = useLinkState('/next')
    return <span data-pending={String(isPending)} />
  }

  function App() {
    return (
      <Router routes={routes}>
        <PendingProbe />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    window.document.querySelector('a')!.click()
    await Promise.resolve()
    await Promise.resolve()
  })

  t.is(window.document.querySelector('[data-pending]')?.getAttribute('data-pending'), 'false')
  t.is(window.document.body.innerHTML, '<div id="root"><span data-pending="false"></span><div>Next</div></div>')
})

test.serial('Link clears pending href after a route-level redirect commits', async (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => <Link href='/old'>Old</Link>,
    },
    { path: '/old', redirect: '/new' } as RouteDefinition,
    { path: '/new', component: () => <div>New</div> },
  ]

  function PendingProbe() {
    const { isPending } = useLinkState('/old')
    return <span data-pending={String(isPending)} />
  }

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
        <PendingProbe />
        <Routes />
      </Router>
    )
  }

  await act(async () => {
    const r = ReactDOM.createRoot(root)
    r.render(<App />)
  })

  await act(async () => {
    router.navigate('/')
  })

  await act(async () => {
    window.document.querySelector('a')!.click()
    await Promise.resolve()
  })

  t.is(window.document.body.innerHTML, '<div id="root"><span data-pending="false"></span><div>New</div></div>')
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
      <Router sync routes={routes}>
        <Routes />
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

test.serial('Link with modifier key lets the browser handle it', (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => <Link href='/foo'>Modified</Link>,
    },
    { path: '/foo', component: () => <div>Foo</div> },
  ]

  function App() {
    return (
      <Router sync routes={routes}>
        <Routes />
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
    event = new window.MouseEvent('click', { bubbles: true, button: 0, cancelable: true, metaKey: true })
    link.dispatchEvent(event)
  })

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
      <Router sync routes={routes}>
        <Routes />
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
      <Router sync routes={routes}>
        <Routes />
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

test.serial('Link with same-page hash lets the browser handle it', async (t) => {
  setup()

  const root = document.getElementById('root')

  const routes = [
    {
      path: '/',
      component: () => (
        <div>
          <Link href='#target'>Jump</Link>
          <section id='target'>Target</section>
        </div>
      ),
    },
    { path: '/target', component: () => <div>Wrong route</div> },
  ]

  function App() {
    return (
      <Router sync routes={routes}>
        <Routes />
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
  t.regex(window.document.body.innerHTML, /Target/)
  t.notRegex(window.document.body.innerHTML, /Wrong route/)

  // jsdom performs the fragment navigation asynchronously (a chain of queued
  // tasks) and fires popstate afterwards; drain enough event-loop turns inside
  // act that the router's reaction doesn't leak past the end of the test.
  await act(async () => {
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  })
})
