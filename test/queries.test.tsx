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

// A minimal figbird-shaped adapter that records how it was driven.
function makeAdapter() {
  const prepared: Array<[unknown, unknown]> = []
  const prefetched: Array<[unknown, unknown]> = []
  const released: Array<[unknown, unknown]> = []
  const adapter: DataAdapter = {
    prepare(def, args) {
      prepared.push([def, args])
      return { promise: Promise.resolve(), release: () => released.push([def, args]) }
    },
    prefetch(def, args) {
      prefetched.push([def, args])
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
        queries: ({ params }: RoutePrepareContext) => [[issueDetail, { id: +params.id }]],
      },
    ]

    await act(async () => {
      ReactDOM.createRoot(root).render(
        <Router sync data={adapter} routes={routes}>
          <CaptureRouter />
          <Routes />
        </Router>,
      )
    })

    // hover warms speculatively through the adapter's prefetch, never prepare
    act(() => {
      hover(window.document.querySelector('a')!)
    })
    t.deepEqual(prefetched, [[issueDetail, { id: 42 }]])
    t.deepEqual(prepared, [])

    // committing the navigation runs the same declaration through prepare
    await act(async () => {
      currentRouter.navigate('/issues/42')
    })
    t.deepEqual(prepared, [[issueDetail, { id: 42 }]])
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
    { path: '/a', component: () => <div>A</div>, queries: () => [[a, { k: 1 }]] },
    { path: '/b', component: () => <div>B</div>, queries: () => [[b, { k: 2 }]] },
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
  t.deepEqual(prepared, [[a, { k: 1 }]])
  t.deepEqual(released, [])

  await act(async () => {
    currentRouter.navigate('/b')
  })
  t.deepEqual(prepared, [
    [a, { k: 1 }],
    [b, { k: 2 }],
  ])
  // the /a lease is released once /b commits
  t.deepEqual(released, [[a, { k: 1 }]])
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
      queries: () => [[heavy, { big: true }]],
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router sync data={adapter} routes={routes}>
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
  t.deepEqual(prepared, [[heavy, { big: true }]])
  t.is(resolverCalls, 1)
})

test.serial('a queries route without a data adapter throws loudly', (t) => {
  setup()
  g.location.href = '/x'
  g.location.pathname = '/x'
  const root = document.getElementById('root')

  const routes = [{ path: '/x', component: () => <div>X</div>, queries: () => [[{}, {}]] }]

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
