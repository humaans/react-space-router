// Prefetching: <Link prefetch> triggers, the Router-level prefetchLinks
// default, transform consistency, and the usePrefetch() primitive.
import test from 'ava'
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { Router, Routes, Link, useNavigate, usePrefetch, type RoutePrepareContext } from '../src/index.tsx'
import { g, setup } from './helpers.ts'

function hover(el: Element) {
  el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
}

test.serial('Link prefetch preloads the resolver chunk and runs route prefetch on hover', async (t) => {
  setup()

  const root = document.getElementById('root')
  let resolverCalls = 0
  const prefetchCalls: RoutePrepareContext[] = []

  const routes = [
    {
      path: '/',
      component: () => (
        <Link href='/items/42' prefetch>
          Item
        </Link>
      ),
    },
    {
      path: '/items/:id',
      resolver: () => {
        resolverCalls++
        return Promise.resolve({ default: () => <div>Item</div> })
      },
      // the return value is ignored by contract — arrays read like prepare's
      prefetch: (ctx: RoutePrepareContext) => [prefetchCalls.push(ctx)],
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync routes={routes}>
        <Routes />
      </Router>,
    )
  })

  // rendering the link alone must not prefetch
  t.is(resolverCalls, 0)
  t.is(prefetchCalls.length, 0)

  act(() => {
    hover(window.document.querySelector('a')!)
  })

  t.is(resolverCalls, 1)
  t.is(prefetchCalls.length, 1)
  t.is(prefetchCalls[0].pathname, '/items/42')
  t.deepEqual(prefetchCalls[0].params, { id: '42' })

  // hovering again re-fires prefetch — freshness is the data layer's job —
  // but the chunk preload stays deduped by the resolver cache
  act(() => {
    hover(window.document.querySelector('a')!)
  })

  t.is(prefetchCalls.length, 2)
  t.is(resolverCalls, 1)
})

test.serial('Router prefetchLinks turns prefetch on for all links, prefetch={false} opts out', async (t) => {
  setup()

  const root = document.getElementById('root')
  const prefetched: string[] = []

  const routes = [
    {
      path: '/',
      component: () => (
        <div>
          <Link href='/a'>A</Link>
          <Link href='/b' prefetch={false}>
            B
          </Link>
        </div>
      ),
    },
    { path: '/a', component: () => null, prefetch: () => prefetched.push('a') },
    { path: '/b', component: () => null, prefetch: () => prefetched.push('b') },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync prefetchLinks routes={routes}>
        <Routes />
      </Router>,
    )
  })

  const [a, b] = window.document.querySelectorAll('a')

  act(() => {
    hover(a)
    hover(b)
  })

  t.deepEqual(prefetched, ['a'])
})

test.serial('prefetch receives the transformed route, matching what a navigation would prepare', async (t) => {
  setup()

  const root = document.getElementById('root')
  const prefetchCalls: RoutePrepareContext[] = []

  const routes = [
    {
      path: '/',
      component: () => (
        <Link href='/items/7' prefetch>
          Item
        </Link>
      ),
    },
    {
      path: '/items/:id',
      component: () => null,
      prefetch: (ctx: RoutePrepareContext) => prefetchCalls.push(ctx),
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync transformRoute={(route) => ({ ...route, query: { ...route.query, restored: '1' } })} routes={routes}>
        <Routes />
      </Router>,
    )
  })

  act(() => {
    hover(window.document.querySelector('a')!)
  })

  t.is(prefetchCalls.length, 1)
  t.deepEqual(prefetchCalls[0].query, { restored: '1' })
})

test.serial('Link prefetch=visible prefetches when the link scrolls into view', async (t) => {
  setup()

  type Entry = { isIntersecting: boolean }
  const instances: FakeIntersectionObserver[] = []

  class FakeIntersectionObserver {
    callback: (entries: Entry[]) => void
    observed: Element[] = []
    disconnected = false
    constructor(callback: (entries: Entry[]) => void) {
      this.callback = callback
      instances.push(this)
    }
    observe(el: Element) {
      this.observed.push(el)
    }
    disconnect() {
      this.disconnected = true
    }
  }
  g.IntersectionObserver = FakeIntersectionObserver

  try {
    const root = document.getElementById('root')
    const prefetched: string[] = []

    const routes = [
      {
        path: '/',
        component: () => (
          <Link href='/below-the-fold' prefetch='visible'>
            Later
          </Link>
        ),
      },
      { path: '/below-the-fold', component: () => null, prefetch: () => prefetched.push('below') },
    ]

    await act(async () => {
      ReactDOM.createRoot(root).render(
        <Router sync routes={routes}>
          <Routes />
        </Router>,
      )
    })

    t.is(instances.length, 1)
    t.is(instances[0].observed[0], window.document.querySelector('a'))
    t.deepEqual(prefetched, [])

    act(() => {
      instances[0].callback([{ isIntersecting: false }])
    })
    t.deepEqual(prefetched, [])

    act(() => {
      instances[0].callback([{ isIntersecting: true }])
    })
    t.deepEqual(prefetched, ['below'])
    // one-shot: the observer disconnects after firing
    t.true(instances[0].disconnected)
  } finally {
    delete g.IntersectionObserver
  }
})

test.serial('Link prefetch=visible disconnects the observer when the ref is cleared', async (t) => {
  setup()

  const instances: FakeIntersectionObserver[] = []

  class FakeIntersectionObserver {
    observed: Element[] = []
    disconnected = false
    constructor() {
      instances.push(this)
    }
    observe(el: Element) {
      this.observed.push(el)
    }
    disconnect() {
      this.disconnected = true
    }
  }
  g.IntersectionObserver = FakeIntersectionObserver

  try {
    const root = document.getElementById('root')
    const routes = [
      {
        path: '/',
        component: () => (
          <Link href='/below-the-fold' prefetch='visible'>
            Later
          </Link>
        ),
      },
      { path: '/below-the-fold', component: () => null, prefetch: () => {} },
    ]

    let rootHandle: ReactDOM.Root
    await act(async () => {
      rootHandle = ReactDOM.createRoot(root)
      rootHandle.render(
        <Router sync routes={routes}>
          <Routes />
        </Router>,
      )
    })

    t.is(instances.length, 1)
    t.is(instances[0].observed[0], window.document.querySelector('a'))
    t.false(instances[0].disconnected)

    await act(async () => {
      rootHandle.unmount()
    })

    t.true(instances[0].disconnected)
  } finally {
    delete g.IntersectionObserver
  }
})

test.serial('usePrefetch warms a target programmatically and no-ops on unmatched URLs', async (t) => {
  setup()

  const root = document.getElementById('root')
  const prefetched: string[] = []

  function Warmer() {
    const prefetch = usePrefetch()
    return (
      <button
        onClick={() => {
          prefetch('/items/9')
          prefetch({ pathname: '/items/:id', params: { id: '10' } })
          prefetch('/no-such-route')
        }}
      >
        warm
      </button>
    )
  }

  const routes = [
    { path: '/', component: Warmer },
    {
      path: '/items/:id',
      component: () => null,
      prefetch: ({ params }: RoutePrepareContext) => prefetched.push(params.id),
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync routes={routes}>
        <Routes />
      </Router>,
    )
  })

  act(() => {
    window.document.querySelector('button')!.click()
  })

  t.deepEqual(prefetched, ['9', '10'])
})

test.serial('usePrefetch stays stable and resolves from the latest committed route', async (t) => {
  setup()
  g.location.href = '/items/one'
  g.location.pathname = '/items/one'

  const root = document.getElementById('root')
  const prefetched: string[] = []
  const prefetchReferences: unknown[] = []
  let navigate

  function Capture() {
    navigate = useNavigate()
    prefetchReferences.push(usePrefetch())
    return null
  }

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router
        sync
        routes={[
          {
            path: '/items/:id',
            component: () => null,
            prefetch: ({ params }: RoutePrepareContext) => prefetched.push(params.id),
          },
        ]}
      >
        <Capture />
        <Routes />
      </Router>,
    )
  })

  const initialPrefetch = prefetchReferences[0] as ReturnType<typeof usePrefetch>

  await act(async () => {
    navigate('/items/two')
  })
  act(() => {
    initialPrefetch({ query: { warm: 'yes' }, merge: true })
  })

  t.deepEqual(prefetched, ['two'])
  t.true(prefetchReferences.every((reference) => reference === initialPrefetch))
})
