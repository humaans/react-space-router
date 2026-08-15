// Route `queries` + the <Router data> adapter: one declaration drives both
// prepare (on navigation) and prefetch (on speculation), the prefetchable
// veto, and the loud failure when an adapter is missing.
import test from 'ava'
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { Router, Routes, Link, useSpaceRouter, type DataAdapter, type RoutePrepareContext } from '../src/index.tsx'
import { g, setup } from './helpers.ts'

function hover(el: Element) {
  el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
}

// A minimal data adapter that records the opaque requests it receives.
function makeAdapter() {
  const prepared: unknown[] = []
  const prefetched: unknown[] = []
  const released: unknown[] = []
  const adapter: DataAdapter = {
    prepare(request) {
      prepared.push(request)
      return { promise: Promise.resolve(), release: () => released.push(request) }
    },
    prefetch(request) {
      prefetched.push(request)
    },
  }
  return { adapter, prepared, prefetched, released }
}

let currentRouter: ReturnType<typeof useSpaceRouter>
function CaptureRouter() {
  currentRouter = useSpaceRouter()
  return null
}

test.serial(
  'one queries declaration drives both adapter.prefetch (hover) and adapter.prepare (navigation)',
  async (t) => {
    setup()
    const root = document.getElementById('root')
    const { adapter, prepared, prefetched } = makeAdapter()
    const issueDetail = { name: 'issueDetail' }
    const issueRequest = (id: number) => ({ definition: issueDetail, args: { id } })

    const routes = [
      {
        path: '/',
        component: () => (
          <Link href='/issues/42' prefetch>
            Issue
          </Link>
        ),
      },
      {
        path: '/issues/:id',
        component: () => <div>Issue</div>,
        queries: ({ params }: RoutePrepareContext) => [issueRequest(+params.id)],
      },
    ]

    await act(async () => {
      ReactDOM.createRoot(root).render(
        <Router sync data={adapter} prefetchHoverDelayMs={0} routes={routes}>
          <CaptureRouter />
          <Routes />
        </Router>,
      )
    })

    // hover warms speculatively through the adapter's prefetch, never prepare
    act(() => {
      hover(window.document.querySelector('a')!)
    })
    t.deepEqual(prefetched, [issueRequest(42)])
    t.deepEqual(prepared, [])

    // committing the navigation runs the same declaration through prepare
    await act(async () => {
      currentRouter.navigate('/issues/42')
    })
    t.deepEqual(prepared, [issueRequest(42)])
  },
)

test.serial('queries handles are pinned on navigation and released on the next', async (t) => {
  setup()
  const root = document.getElementById('root')
  const { adapter, prepared, released } = makeAdapter()
  const a = { name: 'a' }
  const b = { name: 'b' }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    { path: '/a', component: () => <div>A</div>, queries: [a] },
    { path: '/b', component: () => <div>B</div>, queries: [b] },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync data={adapter} routes={routes}>
        <CaptureRouter />
        <Routes />
      </Router>,
    )
  })

  await act(async () => {
    currentRouter.navigate('/a')
  })
  t.deepEqual(prepared, [a])
  t.deepEqual(released, [])

  await act(async () => {
    currentRouter.navigate('/b')
  })
  t.deepEqual(prepared, [a, b])
  // the /a lease is released once /b commits
  t.deepEqual(released, [a])
})

test.serial('prefetchable:false vetoes speculation but still prepares on navigation', async (t) => {
  setup()
  const root = document.getElementById('root')
  const { adapter, prepared, prefetched } = makeAdapter()
  const heavy = { name: 'heavy' }
  let resolverCalls = 0

  const routes = [
    {
      path: '/',
      component: () => (
        <Link href='/heavy' prefetch>
          Heavy
        </Link>
      ),
    },
    {
      path: '/heavy',
      prefetchable: false,
      resolver: () => {
        resolverCalls++
        return Promise.resolve({ default: () => <div>Heavy</div> })
      },
      queries: [heavy],
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync data={adapter} prefetchHoverDelayMs={0} routes={routes}>
        <CaptureRouter />
        <Routes />
      </Router>,
    )
  })

  // an explicit <Link prefetch> can't override the route's veto
  act(() => {
    hover(window.document.querySelector('a')!)
  })
  t.deepEqual(prefetched, [])
  t.is(resolverCalls, 0)

  // real navigation prepares and loads the chunk as usual
  await act(async () => {
    currentRouter.navigate('/heavy')
  })
  t.deepEqual(prepared, [heavy])
  t.is(resolverCalls, 1)
})

test.serial('a queries route without a data adapter throws loudly', (t) => {
  setup()
  g.location.href = '/x'
  g.location.pathname = '/x'
  const root = document.getElementById('root')

  const routes = [{ path: '/x', component: () => <div>X</div>, queries: [{}] }]

  const err = t.throws(() => {
    act(() => {
      ReactDOM.createRoot(root).render(
        <Router sync routes={routes}>
          <Routes />
        </Router>,
      )
    })
  })
  t.regex(err!.message, /`queries`|data.*adapter/i)
})
