import test from 'ava'
import { act } from 'react'
import ReactDOM from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { Link, Router, Routes, useSpaceRouter, type DataAdapter, type Route } from '../src/index.tsx'
import { g, setup } from './helpers.ts'

function makeAdapter() {
  const prepared: unknown[] = []
  const prefetched: unknown[] = []
  const adapter: DataAdapter = {
    prepare(definition) {
      prepared.push(definition)
      return { release() {} }
    },
    prefetch(definition) {
      prefetched.push(definition)
    },
  }
  return { adapter, prepared, prefetched }
}

test.serial('guards redirect the initial route before resolver and query preparation', (t) => {
  setup()
  g.location.href = '/private'
  g.location.pathname = '/private'
  let privateResolverCalls = 0
  const { adapter, prepared } = makeAdapter()

  const routes = [
    {
      guard: ({ url }: Route) => ({
        pathname: '/login',
        query: { returnPath: url },
      }),
      routes: [
        {
          path: '/private',
          resolver: () => {
            privateResolverCalls++
            return Promise.resolve({ default: () => <div>Private</div> })
          },
          queries: ['private'],
        },
      ],
    },
    {
      path: '/login',
      component: () => <div>Login</div>,
      queries: ['login'],
    },
  ]

  const html = renderToString(
    <Router routes={routes} data={adapter} sync>
      <Routes />
    </Router>,
  )

  t.is(html, '<div>Login</div>')
  t.is(privateResolverCalls, 0)
  t.deepEqual(prepared, ['login'])
})

test.serial('guards are re-evaluated after application state changes', async (t) => {
  setup()
  const root = document.getElementById('root')
  const { adapter, prepared } = makeAdapter()
  let admitted = false
  let router: ReturnType<typeof useSpaceRouter>

  function CaptureRouter() {
    router = useSpaceRouter()
    return null
  }

  const routes = [
    { path: '/', component: () => <div>Home</div> },
    {
      guard: () => (admitted ? undefined : '/login'),
      routes: [
        {
          path: '/private',
          component: () => <div>Private</div>,
          queries: ['private'],
        },
      ],
    },
    { path: '/login', component: () => <div>Login</div> },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router routes={routes} data={adapter} mode='memory' sync>
        <CaptureRouter />
        <Routes />
      </Router>,
    )
  })

  await act(async () => router.navigate('/private'))
  t.is(root.textContent, 'Login')
  t.deepEqual(prepared, [])

  admitted = true
  await act(async () => router.navigate('/private'))
  t.is(root.textContent, 'Private')
  t.deepEqual(prepared, ['private'])
})

test.serial('prefetch resolves guards before warming route data', async (t) => {
  setup()
  const root = document.getElementById('root')
  const { adapter, prefetched } = makeAdapter()

  const routes = [
    {
      path: '/',
      component: () => (
        <Link href='/private' prefetch>
          Private
        </Link>
      ),
    },
    {
      guard: () => '/login',
      routes: [
        {
          path: '/private',
          component: () => <div>Private</div>,
          queries: ['private'],
        },
      ],
    },
    {
      path: '/login',
      component: () => <div>Login</div>,
      queries: ['login'],
    },
  ]

  await act(async () => {
    ReactDOM.createRoot(root).render(
      <Router routes={routes} data={adapter} prefetchHoverDelayMs={0} sync>
        <Routes />
      </Router>,
    )
  })

  act(() => {
    root.querySelector('a')!.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
  })

  t.deepEqual(prefetched, ['login'])
})

test.serial('parent guards run before child redirects during initial preparation', (t) => {
  setup()
  g.location.href = '/old'
  g.location.pathname = '/old'
  const { adapter, prepared } = makeAdapter()

  const routes = [
    {
      guard: () => '/login',
      routes: [{ path: '/old', redirect: '/new', queries: ['old'] }],
    },
    {
      path: '/login',
      component: () => <div>Login</div>,
      queries: ['login'],
    },
    {
      path: '/new',
      component: () => <div>New</div>,
      queries: ['new'],
    },
  ]

  const html = renderToString(
    <Router routes={routes} data={adapter} sync>
      <Routes />
    </Router>,
  )

  t.is(html, '<div>Login</div>')
  t.deepEqual(prepared, ['login'])
})

test.serial('guards reject unmatched destinations before preparation', (t) => {
  setup()
  g.location.href = '/private'
  g.location.pathname = '/private'

  const routes = [{ path: '/private', guard: () => '/missing', component: () => <div>Private</div> }]

  const error = t.throws(() =>
    renderToString(
      <Router routes={routes} sync>
        <Routes />
      </Router>,
    ),
  )

  t.regex(error!.message, /guard targeted unmatched URL/)
})

test.serial('guard cycles fail before preparation', (t) => {
  setup()
  g.location.href = '/a'
  g.location.pathname = '/a'

  const routes = [
    { path: '/a', guard: () => '/b' },
    { path: '/b', guard: () => '/a' },
  ]

  const error = t.throws(() =>
    renderToString(
      <Router routes={routes} sync>
        <Routes />
      </Router>,
    ),
  )

  t.regex(error!.message, /too many route redirects or guards/)
})

test.serial('initial static redirects resolve before source preparation', (t) => {
  setup()
  g.location.href = '/old'
  g.location.pathname = '/old'
  const { adapter, prepared } = makeAdapter()

  const routes = [
    { path: '/old', redirect: '/new', queries: ['old'] },
    {
      path: '/new',
      component: () => <div>New</div>,
      queries: ['new'],
    },
  ]

  const html = renderToString(
    <Router routes={routes} data={adapter} sync>
      <Routes />
    </Router>,
  )

  t.is(html, '<div>New</div>')
  t.deepEqual(prepared, ['new'])
})
