// Query transforms: common app-created target resolution, source and
// target context, prefetch consistency, and direct/traversal bypasses.
import test from 'ava'
import { act, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  Navigate,
  Router,
  Routes,
  useLinkProps,
  useMakeHref,
  useNavigate,
  usePrefetch,
  useRoute,
  useSpaceRouter,
  type TransformQuery,
  type RoutePrepareContext,
} from '../src/index.tsx'
import { g, setup } from './helpers.ts'

function hover(el: Element) {
  el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
}

function observeHistoryPushes() {
  const pushed: string[] = []
  const original = history.pushState
  history.pushState = (state: unknown, title: string, url: string) => {
    pushed.push(url)
    original.call(history, state, title, url)
  }
  return { pushed, restore: () => (history.pushState = original) }
}

function sourceAwareTransform(calls?: Array<{ to: unknown; source: string | null; target: string }>): TransformQuery {
  return (query, { to, sourceRoute, targetRoute }) => {
    calls?.push({
      to,
      source: sourceRoute?.url ?? null,
      target: String(targetRoute.data[targetRoute.data.length - 1].queryPolicy),
    })
    return {
      ...query,
      transformed: targetRoute.data[targetRoute.data.length - 1].queryPolicy,
      source: sourceRoute?.params.id ?? 'none',
    }
  }
}

test.serial('transformQuery gives href and prefetch APIs one resolved destination', async (t) => {
  setup()
  history.pushState({}, '', '/source/one')

  const root = document.getElementById('root')
  const calls: Array<{ to: unknown; source: string | null; target: string }> = []
  const prefetched: RoutePrepareContext[] = []
  let router
  let makeHref
  let prefetch
  let customHref = ''

  function Source() {
    router = useSpaceRouter()
    makeHref = useMakeHref()
    prefetch = usePrefetch()
    const custom = useLinkProps('/target?api=props')
    customHref = custom.href
    return (
      <div>
        <a id='custom' {...custom}>
          Custom
        </a>
        <Link id='link' href='/target?api=link' prefetch>
          Link
        </Link>
      </div>
    )
  }

  const routes = [
    { path: '/source/:id', component: Source, queryPolicy: 'source' },
    {
      path: '/target',
      component: () => null,
      queryPolicy: 'target',
      prefetch: (ctx: RoutePrepareContext) => prefetched.push(ctx),
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync transformQuery={sourceAwareTransform(calls)}>
        <Routes routes={routes} />
      </Router>,
    )
  })

  const expected = (api: string) => `/target?api=${api}&transformed=target&source=one`
  t.is(customHref, expected('props'))
  t.is(window.document.querySelector('#link')?.getAttribute('href'), expected('link'))
  t.is(router.href('/target?api=router-string'), expected('router-string'))
  t.is(router.href({ url: '/target?api=router-object' }), expected('router-object'))
  t.is(makeHref('/target?api=make-href'), expected('make-href'))

  act(() => {
    prefetch('/target?api=prefetch')
  })
  t.deepEqual(prefetched[0].query, {
    api: 'prefetch',
    transformed: 'target',
    source: 'one',
  })

  const callsBeforeHover = calls.length
  act(() => {
    hover(window.document.querySelector('#link')!)
  })
  t.is(calls.length, callsBeforeHover)
  t.deepEqual(prefetched[1].query, {
    api: 'link',
    transformed: 'target',
    source: 'one',
  })

  t.true(calls.some((call) => call.to === '/target?api=router-string'))
  t.true(calls.every((call) => call.source === '/source/one'))
  t.true(calls.every((call) => call.target === 'target'))
})

test.serial('useNavigate and public navigate serialize the same transformed query', async (t) => {
  setup()
  history.pushState({}, '', '/source/one')
  const historyObserver = observeHistoryPushes()

  const root = document.getElementById('root')
  let navigate
  let router

  function Capture() {
    navigate = useNavigate()
    router = useSpaceRouter()
    return null
  }

  try {
    await act(async () => {
      ReactDOM.createRoot(root).render(
        <Router sync transformQuery={sourceAwareTransform()}>
          <Capture />
          <Routes
            routes={[
              { path: '/source/:id', component: () => null, queryPolicy: 'source' },
              { path: '/target', component: () => null, queryPolicy: 'target' },
            ]}
          />
        </Router>,
      )
    })

    await act(async () => {
      navigate('/target?api=hook')
      router.navigate({ url: '/target?api=public' })
    })

    t.deepEqual(historyObserver.pushed, [
      '/target?api=hook&transformed=target&source=one',
      '/target?api=public&transformed=target&source=one',
    ])
  } finally {
    historyObserver.restore()
  }
})

test.serial(
  'Link and useLinkProps clicks navigate to their rendered transformed hrefs without reapplying',
  async (t) => {
    setup()
    history.pushState({}, '', '/source/one')
    const historyObserver = observeHistoryPushes()

    const root = document.getElementById('root')
    let transformCalls = 0
    let transformReapplications = 0

    function Source() {
      const custom = useLinkProps('/target?api=props')
      return (
        <div>
          <a id='custom' {...custom}>
            Custom
          </a>
          <Link id='link' href='/target?api=link'>
            Link
          </Link>
        </div>
      )
    }

    try {
      await act(async () => {
        ReactDOM.createRoot(root).render(
          <Router
            sync
            transformQuery={(query, context) => {
              transformCalls++
              if (query.transformed) transformReapplications++
              return sourceAwareTransform()(query, context)
            }}
          >
            <Routes
              routes={[
                { path: '/source/:id', component: Source, queryPolicy: 'source' },
                { path: '/target', component: () => null, queryPolicy: 'target' },
              ]}
            />
          </Router>,
        )
      })

      const custom = window.document.querySelector<HTMLAnchorElement>('#custom')!
      const link = window.document.querySelector<HTMLAnchorElement>('#link')!
      t.true(transformCalls > 0)

      act(() => {
        custom.click()
        link.click()
      })

      t.is(transformReapplications, 0)
      t.deepEqual(historyObserver.pushed, [custom.getAttribute('href'), link.getAttribute('href')])
    } finally {
      historyObserver.restore()
    }
  },
)

test.serial('Navigate uses the same query-transform destination pipeline', async (t) => {
  setup()
  history.pushState({}, '', '/source/one')
  const historyObserver = observeHistoryPushes()

  const root = document.getElementById('root')
  let showNavigate

  function Source() {
    const [show, setShow] = useState(false)
    showNavigate = setShow
    return show ? <Navigate to={{ url: '/target?api=navigate' }} /> : null
  }

  try {
    await act(async () => {
      ReactDOM.createRoot(root).render(
        <Router sync transformQuery={sourceAwareTransform()}>
          <Routes
            routes={[
              { path: '/source/:id', component: Source, queryPolicy: 'source' },
              { path: '/target', component: () => null, queryPolicy: 'target' },
            ]}
          />
        </Router>,
      )
    })

    await act(async () => {
      showNavigate(true)
    })

    t.deepEqual(historyObserver.pushed, ['/target?api=navigate&transformed=target&source=one'])
  } finally {
    historyObserver.restore()
  }
})

test.serial('direct loads and browser traversal bypass transformQuery', async (t) => {
  setup()
  history.pushState({}, '', '/target?historical=direct')

  const root = document.getElementById('root')
  let transformCalls = 0

  function Page() {
    const route = useRoute()
    return <div>{route?.url}</div>
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        transformQuery={(query) => {
          transformCalls++
          return { ...query, injected: 'yes' }
        }}
      >
        <Routes
          routes={[
            { path: '/source', component: Page },
            { path: '/target', component: Page },
          ]}
        />
      </Router>,
    )
  })

  t.is(window.document.body.textContent, '/target?historical=direct')
  t.is(transformCalls, 0)

  g.location.href = '/source?historical=traversal'
  g.location.pathname = '/source'
  g.location.search = '?historical=traversal'
  await act(async () => {
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })

  t.is(window.document.body.textContent, '/source?historical=traversal')
  t.is(transformCalls, 0)
})

test.serial('stable callbacks use the latest source route and unmatched targets stay retryable', async (t) => {
  setup()
  history.pushState({}, '', '/source/one')
  const historyObserver = observeHistoryPushes()

  const root = document.getElementById('root')
  const sources: Array<string | null> = []
  let navigate
  let router

  function Capture() {
    navigate = useNavigate()
    router = useSpaceRouter()
    return null
  }

  try {
    await act(async () => {
      ReactDOM.createRoot(root).render(
        <Router
          sync
          transformQuery={(query, { sourceRoute }) => {
            sources.push(sourceRoute?.pathname ?? null)
            return { ...query, source: sourceRoute?.params.id ?? 'none' }
          }}
        >
          <Capture />
          <Routes
            routes={[
              { path: '/source/:id', component: () => null },
              { path: '/target', component: () => null },
            ]}
          />
        </Router>,
      )
    })
    const initialNavigate = navigate
    const initialRouter = router

    await act(async () => {
      navigate('/source/two')
    })
    t.is(initialRouter.href('/target'), '/target?source=two')
    await act(async () => {
      initialNavigate('/target')
    })
    t.is(historyObserver.pushed[1], '/target?source=two')
    t.is(sources[sources.length - 1], '/source/two')

    await act(async () => {
      initialNavigate('/missing')
    })
    await act(async () => {
      initialNavigate('/missing')
    })
    t.deepEqual(historyObserver.pushed.slice(-2), ['/missing', '/missing'])
  } finally {
    historyObserver.restore()
  }
})

test.serial('transformQuery preserves codec, hash, replace, empty values, and deletions', async (t) => {
  setup()
  history.pushState({}, '', '/source')

  const root = document.getElementById('root')
  const replaced: string[] = []
  const codec = {
    parse(value: string) {
      return Object.fromEntries(
        value
          .split(';')
          .filter(Boolean)
          .map((pair) => pair.split('~')),
      ) as Record<string, string>
    },
    stringify(query: Record<string, unknown>) {
      return Object.keys(query)
        .filter((key) => query[key] !== undefined)
        .map((key) => `${key}~${String(query[key])}`)
        .join(';')
    },
  }
  let router

  function Capture() {
    router = useSpaceRouter()
    return null
  }

  g.history.replaceState = (_state: unknown, _title: string, url: string) => {
    replaced.push(url)
    g.location.href = url
    g.location.pathname = url.split(/[?#]/)[0]
    g.location.search = url.includes('?') ? `?${url.split('?')[1].split('#')[0]}` : ''
    g.location.hash = url.includes('#') ? `#${url.split('#')[1]}` : ''
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        qs={codec}
        transformQuery={(query, { to }) => {
          if (typeof to !== 'string' && to.query === null) return null
          return { ...query, remove: undefined, empty: '' }
        }}
      >
        <Capture />
        <Routes
          routes={[
            { path: '/source', component: () => null },
            { path: '/target', component: () => null },
          ]}
        />
      </Router>,
    )
  })

  t.is(router.href('/target?keep~yes;remove~gone#section'), '/target?keep~yes;empty~#section')
  t.is(router.href({ pathname: '/target', query: null }), '/target')

  await act(async () => {
    router.navigate({ url: '/target?remove~gone#section', replace: true })
  })
  t.deepEqual(replaced, ['/target?empty~#section'])
})

test.serial('transformQuery preserves hash-prefixed route hrefs in hash mode', async (t) => {
  setup()
  g.location.pathname = '/app'
  g.location.hash = '#/source'
  const assigned: string[] = []
  g.location.assign = (url: string) => {
    assigned.push(url)
    g.location.hash = url
    window.dispatchEvent(new window.Event('hashchange'))
  }

  const root = document.getElementById('root')
  let router
  let transformCalls = 0

  function Capture() {
    router = useSpaceRouter()
    return null
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        mode='hash'
        transformQuery={(query) => {
          transformCalls++
          return { ...query, transformed: 'yes' }
        }}
      >
        <Capture />
        <Routes
          routes={[
            { path: '/source', component: () => null },
            { path: '/target', component: () => null },
            { path: '*', component: () => null },
          ]}
        />
      </Router>,
    )
  })

  t.is(router.href('#section'), '#section')
  t.is(transformCalls, 0)
  t.is(router.href('#/target?explicit=1'), '#/target?explicit=1&transformed=yes')
  t.is(transformCalls, 1)
  await act(async () => {
    router.navigate('#/target?explicit=1')
  })
  t.deepEqual(assigned, ['#/target?explicit=1&transformed=yes'])
})

test.serial('transformQuery and prefetch bypass non-route hrefs even with a wildcard route', async (t) => {
  setup()
  history.pushState({}, '', '/source')

  const root = document.getElementById('root')
  let router
  let prefetch
  let transformCalls = 0
  let wildcardPrefetches = 0

  function Source() {
    router = useSpaceRouter()
    prefetch = usePrefetch()
    return (
      <div>
        <Link id='fragment' href='#section' prefetch>
          Section
        </Link>
        <Link id='email' href='mailto:hello@example.com' prefetch>
          Email
        </Link>
        <Link id='external' href='https://example.com/path?keep=1' prefetch>
          External
        </Link>
        <Link id='protocol-relative' href='//cdn.example.com/file' prefetch>
          CDN
        </Link>
      </div>
    )
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        transformQuery={(query) => {
          transformCalls++
          return { ...query, transformed: 'yes' }
        }}
      >
        <Routes
          routes={[
            { path: '/source', component: Source },
            {
              path: '*',
              component: () => null,
              prefetch: () => wildcardPrefetches++,
            },
          ]}
        />
      </Router>,
    )
  })

  const href = (id: string) => window.document.querySelector(`#${id}`)?.getAttribute('href')
  t.is(href('fragment'), '#section')
  t.is(href('email'), 'mailto:hello@example.com')
  t.is(href('external'), 'https://example.com/path?keep=1')
  t.is(href('protocol-relative'), '//cdn.example.com/file')
  t.is(router.href('#section'), '#section')
  t.is(router.href('mailto:hello@example.com'), 'mailto:hello@example.com')
  t.is(router.href('https://example.com/path?keep=1'), 'https://example.com/path?keep=1')
  t.is(transformCalls, 0)

  act(() => {
    prefetch('#section')
    prefetch('mailto:hello@example.com')
    prefetch('https://example.com/path?keep=1')
    hover(window.document.querySelector('#fragment')!)
    hover(window.document.querySelector('#email')!)
    hover(window.document.querySelector('#external')!)
    hover(window.document.querySelector('#protocol-relative')!)
  })
  t.is(transformCalls, 0)
  t.is(wildcardPrefetches, 0)

  t.is(router.href('/unlisted?keep=1'), '/unlisted?keep=1&transformed=yes')
  act(() => {
    prefetch('/unlisted?keep=1')
  })
  t.is(wildcardPrefetches, 1)
})

test.serial('without transformQuery URL strings remain byte-for-byte unchanged', async (t) => {
  setup()
  history.pushState({}, '', '/source')

  const root = document.getElementById('root')
  let router

  function Source() {
    router = useSpaceRouter()
    return <Link href='/target?encoded=%2f&empty=#section'>Target</Link>
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync>
        <Routes
          routes={[
            { path: '/source', component: Source },
            { path: '/target', component: () => null },
          ]}
        />
      </Router>,
    )
  })

  const target = '/target?encoded=%2f&empty=#section'
  t.is(router.href(target), target)
  t.is(window.document.querySelector('a')?.getAttribute('href'), target)
})
