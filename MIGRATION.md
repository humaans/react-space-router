# Migration Guide

## 0.6.x → 0.7.0

The Router lifecycle is reframed: the router now owns route state internally
(via `useState` + `useTransition`) and applies it inside a React transition. The
old prop-based escape hatches (`onNavigating`, `onNavigated`, `useRoute`) are
gone, replaced by a single pre-commit transform and an explicit pending hook.

This is a breaking change for any app that stored route state outside the
router or did async work in `onNavigating`.

### Surface changes

| Before | After |
| --- | --- |
| `<Router useRoute={...} onNavigating={...} onNavigated={...}>` | `<Router transformRoute={...}>` |
| External Redux/atom-backed route state | Internal `useState` only |
| Manual `navigating: true/false` flag | `usePending()` |
| `route.data[i].component` only | `route.data[i].component` **or** `resolver: () => import(...)` |
| (no equivalent) | `route.data[i].prepare(ctx)` returning `PreparedHandle[]` |

### Why the change

`useTransition` only works if the router itself owns the state update. If route
state lives in your Redux/Zustand store, the router's commit goes through your
dispatch — which isn't wrapped in `startTransition` — and Suspense fires
fallbacks at the wrong moment.

The same applies to delayed fallbacks: the router needs to know when a
transition is in flight so `<DelayedSuspense>` can hold the previous route for
`pendingDelayMs` before showing a skeleton. If state lives outside, you'd have
to expose "pending next route" + "previous route" + "has the threshold elapsed"
through your store. That's the router's job, leaking.

### Migrating `onNavigating`

`onNavigating` was used for two things. Both have replacements:

**1. Awaiting `routeData.resolver()` to attach the component.**

Before:

```ts
const onNavigating = async (route) => {
  await Promise.all(
    route.data.map(async (rd) => {
      if (!rd.component && rd.resolver) {
        rd.component = await rd.resolver()
      }
    }),
  )
}
```

After: delete it. Declare `resolver` on the route segment and the router
preloads + renders via `React.lazy` automatically:

```ts
{ path: '/issues/:id', resolver: () => import('./pages/IssueDetail') }
```

The destination's `<Suspense>` boundary handles the still-cold render.

**2. Toggling a `navigating` flag for a top-of-page loading bar.**

Before:

```ts
const onNavigating = async (route) => {
  store.set(routerAtom, (s) => ({ ...s, navigating: true }))
  // ... await stuff ...
}
const onNavigated = (route) => {
  store.set(routerAtom, (s) => ({ ...s, navigating: false }))
}
```

After:

```ts
import { usePending } from 'react-space-router'

function LoadingBar() {
  const pending = usePending()
  return pending ? <Bar /> : null
}
```

`usePending()` reads React's transition pending state directly — no manual flag
needed.

### Migrating `onNavigated`

Most uses are observers and become plain effects on `useRoute()`.

**Analytics:**

```ts
// Before
const onNavigated = (route) => trackPageView(route, prev)

// After
const route = useRoute()
useEffect(() => trackPageView(route), [route])
```

**Previous route tracking:**

```ts
// Before
const onNavigated = (route) => store.set(routerAtom, (s) => ({
  ...s, route, previousRoute: s.route,
}))

// After
const route = useRoute()
const prev = usePrevious(route) // your standard usePrevious hook
```

**Param reduction across `route.data`:**

This was usually done because product code wanted to merge `params` declared on
ancestor segments. Move it to a `useRoute()` selector:

```ts
function useMergedParams() {
  const route = useRoute()
  return useMemo(
    () =>
      route?.data.reduce(
        (acc, d) => Object.assign(acc, (d as any).params || {}),
        { ...route.params },
      ) ?? {},
    [route],
  )
}
```

### Migrating persisted-query restoration → `transformRoute`

This is the one case that genuinely needed pre-commit behavior. `transformRoute`
runs synchronously between match and commit; if it returns a route with a
different `url`, the router calls `history.replaceState` so the address bar
matches.

Before (`onNavigated` did the rewrite + manual `replaceState`):

```ts
const onNavigated = (route) => {
  const persistKey = getPersistKey(route)
  if (persistKey && !hasQuery(route)) {
    const saved = persistedQueries.get(persistKey)
    if (saved) {
      const merged = { ...Object.fromEntries(new URLSearchParams(saved)), ...route.query }
      const search = '?' + new URLSearchParams(merged).toString()
      const url = route.pathname + search
      store.set(routerAtom, (s) => ({ ...s, route: { ...route, query: merged, search, url } }))
      window.history.replaceState({}, '', url)
      return
    }
  }
  store.set(routerAtom, (s) => ({ ...s, route }))
}
```

After:

```ts
function transformRoute(route) {
  const persistKey = getPersistKey(route)
  if (!persistKey || hasQuery(route)) return // unchanged

  const saved = persistedQueries.get(persistKey)
  if (!saved) return

  const merged = { ...Object.fromEntries(new URLSearchParams(saved)), ...route.query }
  const search = '?' + new URLSearchParams(merged).toString()
  return { ...route, query: merged, search, url: route.pathname + search }
}

<Router transformRoute={transformRoute}>...</Router>
```

`transformRoute` must be pure and synchronous. Returning `undefined` (or `void`)
means "commit unchanged".

### Removing the `useRoute` injection prop

If you previously did:

```ts
<Router useRoute={() => useSelector(() => routerAtom().route)}>
```

…delete it. The router holds route state internally; `useRoute()` from
`react-space-router` is the read API. Components subscribe to it directly.

The kinfolk/Redux/Zustand atom that mirrored the router's state should be
deleted entirely — it was a relic of the "everything in global state" era and
breaks Suspense's transition contract.

### Removing function-form `<Link>` props

`<Link>` no longer accepts function-form `className`, function-form `style`, or
`extraProps`. Use the `aria-current="page"` attribute that `<Link>` already
sets:

```tsx
// Before
<Link href='/settings' className={(current) => (current ? 'nav active' : 'nav')} />

// After
<Link href='/settings' className='nav' />
```

```css
.nav[aria-current='page'] {
  font-weight: 600;
}
```

For active-aware logic that cannot be expressed in CSS, use `useLinkProps()`:

```tsx
const linkProps = useLinkProps('/settings')
return <a {...linkProps}>{linkProps.isCurrent ? 'Settings' : 'Go to settings'}</a>
```

User `onClick` handlers now compose with the router's internal click handling.
The user handler runs first; call `event.preventDefault()` to opt out of SPA
navigation for that click.

### Replacing delayed fallback code with `<DelayedSuspense>`

If you had app-level state to suppress skeletons for the first few milliseconds
of a navigation, delete it and use the built-in boundary:

```tsx
<Router pendingDelayMs={1000}>
  <Suspense fallback={null}>
    <Routes routes={routes} />
  </Suspense>
</Router>
```

```tsx
<DelayedSuspense fallback={<Skeleton />}>
  <Panel />
</DelayedSuspense>
```

During an in-flight navigation, `<DelayedSuspense>` behaves like a regular
`Suspense` boundary after the router-level `pendingDelayMs` threshold. Before
that threshold, its fallback re-suspends so the already-committed route stays on
screen.

### What's *not* changing

- Route definition shape (`{ path, component, routes, ... }`) is unchanged. New
  fields (`resolver`, `prepare`, `navigation`, `scrollGroup`) are additive.
- `<Routes routes={...}>`, `<Link>`, `<Navigate>`, `useLinkProps`, `useMakeHref`,
  `useNavigate`, `qs` — unchanged.
- ESM-default components (`{ default: Component }`) still resolve via plain
  `component:` — you don't have to switch to `resolver:` unless you want the
  preload-and-suspend behavior.
- The `reduceRight` segment-rendering model stays. No `<Outlet />` — parents
  receive `children` like any React component.

### What's still not included

These are still outside 0.7.0:

- `<DelayedSuspense>` per-instance `delayMs` override (today only the
  Router-level `pendingDelayMs` is configurable).
- `useBlocker(predicate)` for cancellable navigation guards (unsaved-changes
  prompts). Don't try to rebuild this with `transformRoute` — different shape.
