# Migration Guide

## 0.6.x → 1.0.0

Version 1.0 moves route ownership into `<Router>` so navigation can use React transitions and Suspense correctly. Most route definitions and navigation APIs remain unchanged.

### Check the runtime baseline

React 18 or newer is required. The package is native ESM targeting ECMAScript 2022; CommonJS applications must migrate to ESM, and older browser targets must transpile the package and provide any required polyfills.

### Move routes to `<Router>`

`<Router>` now owns matching and route state. `<Routes />` only marks where the matched component tree renders.

```tsx
// Before
<Router>
  <Routes routes={routes} />
</Router>

// After
<Router routes={routes}>
  <Routes />
</Router>
```

### Remove external route-state wiring

The `useRoute`, `onNavigating`, and `onNavigated` props have been removed from `<Router>`.

- Read the committed route with `useRoute()`.
- Read transition state with `usePending()` and `usePendingRoute()`.
- Read the last successfully committed route with `usePreviousRoute()`.
- Run analytics and other post-navigation work in an effect keyed by `useRoute()`.

```tsx
function PageView() {
  const route = useRoute()
  const previousRoute = usePreviousRoute()

  useEffect(() => {
    trackPageView(route, previousRoute)
  }, [route, previousRoute])

  return null
}
```

Replace async component loading previously performed in `onNavigating` with a route `resolver`:

```tsx
{ path: '/issues/:id', resolver: () => import('./pages/IssueDetail') }
```

Start route data with low-level `prepare(ctx)`, or declare it once with `queries` and provide a `<Router data>` adapter:

```tsx
const routes = [
  {
    path: '/issues/:id',
    queries: ({ params }) => [issueDetail({ id: Number(params.id) })],
  },
]

<Router routes={routes} data={{ prepare, prefetch }}>
  <Routes />
</Router>
```

Each value returned by `queries` is an opaque request forwarded unchanged to `data.prepare(request)` during navigation and `data.prefetch(request)` during speculation. Route and adapter `prepare` functions must return synchronously and must not throw; asynchronous failures should surface through the data layer's Suspense read path.

Use `transformRoute` only when the matched route itself must be rewritten before commit. Use `transformQuery` for query policy applied to app-created destinations.

### Update active-link styling

Function-form `className`, function-form `style`, and `extraProps` have been removed from `<Link>`. Use the attributes emitted by the link:

```tsx
<Link href='/settings' className='nav'>
  Settings
</Link>
```

```css
.nav[aria-current='page'] {
  font-weight: 600;
}

.nav[data-pending] {
  opacity: 0.6;
}
```

For active or pending state that changes rendered output, use `useLinkState(to)`.

### Rename the router escape hatch

Replace `useInternalRouterInstance()` with `useSpaceRouter()`. Both expose the underlying space-router instance; most applications should continue using the higher-level hooks instead.

### Unchanged fundamentals

The nested route shape (`path`, `component`, `routes`, `props`, and `scrollGroup`) remains valid. `<Link>`, `<Navigate>`, `useNavigate()`, `useLinkProps()`, and `useMakeHref()` retain their existing roles; the new Suspense, prefetching, data-loading, and navigation-blocking APIs are additive.
