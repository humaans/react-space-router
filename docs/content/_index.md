---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

> [Space Router](https://kidkarolis.github.io/space-router/) bindings for React

React Space Router is a set of hooks and components for keeping your app in sync with the URL and performing page navigations. Suspense-native and built around React's transition machinery. A library built by and used at [Humaans](https://humaans.io/).

- Suspense-native navigation that keeps the previous route visible while the next one loads.
- Nested, code-split routes with path params passed straight to route components.
- Route-level data loading and prefetching through a small, data-layer-agnostic adapter.
- Link prefetching on hover, focus, touch, or visibility.
- Previous and pending route state for back links, global indicators, sidebars, tabs, and breadcrumbs.
- Delayed loading fallbacks for fast-feeling browser-style transitions.

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework-agnostic tiny core that handles URL listening, route matching, and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility for modern Suspense-driven UIs.

## Install

```sh
$ npm install react-space-router
```

## Compatibility

The peer dependency is React 18 or newer, with React 18 and React 19 exercised in CI.

The published package is native ESM targeting ECMAScript 2022. It is intended for modern evergreen browsers and does not include downlevel transforms or polyfills. Applications targeting older JavaScript engines must transpile the package as part of their build and provide any required platform polyfills. Visibility prefetching requires `IntersectionObserver`; when it is unavailable, `prefetch='visible'` safely does nothing.

## Example

```js
import React, { Suspense, useEffect } from 'react'
import { Router, Routes, Link, useRoute, useNavigate } from 'react-space-router'

const routes = [
  { path: '/', component: Home },
  {
    component: SettingsContainer,
    routes: [
      { path: '/settings', component: Settings },
      { path: '/settings/billing', resolver: () => import('./Billing') },
    ],
  },
]

function App() {
  return (
    <Router routes={routes}>
      <Suspense fallback={null}>
        <Routes />
      </Suspense>
    </Router>
  )
}

function Home() {
  const { pathname, params, query } = useRoute()
  return (
    <div>
      <h1>Home</h1>
      <Link href='/settings'>Settings</Link>
    </div>
  )
}

function Settings() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ url: '/settings/billing' })
  }, [])

  return (
    <div>
      <h1>Settings</h1>
      <Link href='/'>Home</Link>
    </div>
  )
}
```

## Loading UI

Where you place Suspense boundaries in the destination page decides what a navigation looks like. The rule, from React itself: a transition holds the previous page only when a suspension would hide already-visible content — boundaries that mount fresh as part of the new page show their fallbacks immediately.

Take one route:

```js
const routes = [
  {
    path: '/inbox',
    resolver: () => import('./Inbox'),
    prepare: () => [inbox.prepare()],
  },
]
```

**Go to the destination immediately, skeletons inside.** An inner boundary mounts with the page, so the route commits right away and the skeleton shows while data loads:

```jsx
export default function Inbox() {
  return (
    <>
      <Header />
      <Suspense fallback={<ListSkeleton />}>
        <MessageList /> {/* reads inbox data, suspends if not ready */}
      </Suspense>
    </>
  )
}
```

**Hold the previous page until the data is ready.** No inner boundary — the page itself suspends, so the transition keeps the previous page on screen:

```jsx
export default function Inbox() {
  const messages = inbox.read()
  return <MessageList messages={messages} />
}
```

**Hybrid.** Hold the previous page for `pendingDelayMs`, then degrade to the skeleton if data is still loading:

```jsx
export default function Inbox() {
  return (
    <DelayedSuspense fallback={<ListSkeleton />}>
      <MessageList />
    </DelayedSuspense>
  )
}
```

One caveat: a cold `resolver` chunk always holds the previous page briefly — a boundary inside a chunk that hasn't downloaded yet can't show a fallback. The router minimizes that window by preloading the chunk the moment navigation starts, in parallel with `prepare()`.

The [demo](https://github.com/humaans/react-space-router/tree/master/demo) shows these modes side by side over simulated latencies — run it with `npm run demo`.

## Errors and recovery

Put a React error boundary outside the Suspense boundary that contains `<Routes />`. Resolver failures, errors thrown while rendering a route, and rejected data reads then reach the route error boundary, while promises still go to Suspense:

```jsx
<Router routes={routes}>
  <RouteErrorBoundary>
    <Suspense fallback={<PageSkeleton />}>
      <Routes />
    </Suspense>
  </RouteErrorBoundary>
</Router>
```

`RouteErrorBoundary` above is your application's regular React error boundary. A boundary declared inside a lazy route cannot catch failure to download that route, because the component containing it has not loaded yet. Put an additional application boundary outside `<Router>` if you also want to report initial synchronous configuration errors.

When a resolver rejects, starting that navigation again replaces the rejected resolver and lazy-component cache entries; a retry action should navigate to the failed URL and reset the boundary in the same event. This can recover from transient network or CDN failures. After a deployment, however, an old tab may still request a chunk URL that no longer exists; retrying then requests the same stale URL. Route error UI should offer a full-page reload (`window.location.reload()`) as the dependable recovery path so the browser downloads the current application bundle and chunk map.

Data loading follows the same React model: `prepare` starts or pins work synchronously, and route components read it through the data cache. The read should throw a pending promise to Suspense and a rejected request error to the error boundary. Route and adapter `prepare` functions must not throw synchronously; asynchronous request failure belongs in that read path.

## Blocking navigation

Render `<BlockNavigation>` while a page has changes that would be lost. The native mode asks for confirmation with the browser's dialog:

```jsx
{isDirty && <BlockNavigation message='Discard unsaved changes?' />}
```

For application UI, provide a render function. It renders only after a navigation is attempted:

```jsx
{isDirty && (
  <BlockNavigation>
    {({ proceed, cancel }) => (
      <DiscardChangesDialog onDiscard={proceed} onCancel={cancel} />
    )}
  </BlockNavigation>
)}
```

`proceed()` performs the retained navigation once; `cancel()` stays on the current page. Unmounting the blocker also cancels a pending attempt. While confirmation is pending, further attempts are ignored, so the dialog always represents the first attempted destination.

Links, `<Navigate>`, `useNavigate()`, and `useSpaceRouter().navigate()` are blocked before history changes in every supported browser. Cancelable same-document Back/Forward traversal is also blocked in browsers with the Navigation API, then replayed to the exact history entry on `proceed()`. Without that API, Back/Forward cannot be intercepted and proceeds normally. Full-page exits and reloads use `beforeunload`; browsers own that prompt and may ignore the supplied message. Same-page fragment navigation remains browser-owned and is not blocked.

When multiple blockers are mounted, the first one handles each attempted navigation.

## Prefetching

Prefetching warms the route the user is likely to visit next. The usual setup is: declare data once on the route with `queries`, give `<Router>` a data adapter, then opt links into prefetching.

```js
import { prepare, prefetch } from './figbird'

const routes = [
  {
    path: '/issues/:id',
    resolver: () => import('./pages/IssueDetail'),
    queries: ({ params }) => [[issueDetail, { id: +params.id }]],
  },
]

<Router routes={routes} data={{ prepare, prefetch }}>...</Router>
<Link href={`/issues/${id}`} prefetch />
```

On navigation, each query runs through `data.prepare(def, args)` and the returned handles stay pinned until the route changes. On prefetch, the same query runs through `data.prefetch(def, args)` and the return value is ignored. Resolver chunks are warmed too.

`<Link prefetch>` means cancellable hover intent (50ms by default) plus immediate focus/touch. Use `prefetch='visible'` for viewport-based prefetching, `<Router prefetchLinks>` to make prefetching the default for all links, and `prefetch={false}` to opt one link out. Configure the hover delay with `<Router prefetchHoverDelayMs={50}>`; `0` restores immediate hover prefetching. A route can set `prefetchable: false` to block speculative warming while still preparing normally on real navigation.

For unusual cases, use route-level `prepare(ctx)` / `prefetch(ctx)` directly, or call `usePrefetch()` from your own trigger.

## API

### `<Router />`

Wraps the application and provides router context and state. Route state lives inside the router (`useState` + `useTransition`); commits are wrapped in a transition so Suspense can keep the previous route on screen while the next one prepares.

Props:

- `routes` an array of route definitions, where each route is an object of shape `{ path, redirect, component, resolver, queries, prepare, props, scrollGroup, routes, ...metadata }`:
  - `path` complete URL pattern. See [Path patterns](#path-patterns).
  - `redirect` a navigation target, or `(route) => target`. Redirects replace the current history entry before the route reaches React. See [Redirects](#redirects).
  - `component` a React component to render. Accepts an ESM-default module shape (`{ default: Component }`) too.
  - `resolver` `() => import('./Screen')` — a dynamic import. The router preloads this at navigation time and renders via `React.lazy`. Cold imports suspend at the destination's Suspense boundary.
  - `queries(ctx)` declares the route's data needs once as `[def, args]` pairs, run through the `<Router data>` adapter — as `prepare` on navigation, as `prefetch` on speculation (see [Prefetching](#prefetching)). Requires a `data` adapter.
  - `prepare(ctx)` the low-level alternative to `queries` for prepare. Called at navigation time with `{ pathname, url, params, query }`; returns `PreparedHandle` objects pinned for the lifetime of the committed navigation and released when the next navigation commits. It is synchronous setup and must not throw; surface request failures later through the data cache's Suspense read path.
  - `prefetch(ctx)` the low-level alternative to `queries` for prefetch — called when a prefetching link warms this route. May fire at any frequency; the return value is ignored.
  - `prefetchable` set `false` to exclude a route from speculative prefetch (no chunk preload, no `prefetch`) while still preparing on real navigation. A route-level veto that beats an explicit `<Link prefetch>`.
  - `props` props to pass to the segment's component.
  - `scrollGroup` a string that groups routes; app-created navigations within a group don't scroll to top unless the destination has an explicit hash fragment.
  - `routes` nested route definitions.
  - `...metadata` any other keys you want — they're available on `route.data[i]`.
- `mode` one of `history`, `hash`, `memory` — default is `history`.
- `qs` a custom query string parser of shape `{ parse, stringify }`.
- `sync` if `true`, the underlying space-router fires synchronous transitions (useful in tests).
- `transformRoute(route)` an optional pure, synchronous function that runs between match and commit. Return a modified `Route` to change what gets committed; if its `url` differs from the matched URL, the router silently replaces the URL (mode-aware, so it works in hash mode too) so the address bar matches. Use this for things like persisted-query restoration. Must not be async.
- `transformQuery(query, { to, sourceRoute, targetRoute })` an optional pure, synchronous mapping for the query of app-created destinations. It returns the query serialized by the configured `qs` codec, or `null` to remove the query. See [Query transform](#query-transform).
- `data` a data adapter of shape `{ prepare(def, args), prefetch(def, args) }` that bridges route `queries` to a data layer (see [Prefetching](#prefetching)). `prepare` returns a `PreparedHandle`; `prefetch` warms speculatively. figbird's kit satisfies this directly. Should be referentially stable; required only if a route uses `queries`.
- `prefetchLinks` default prefetch trigger for every link: `true`/`'hover'` or `'visible'`. Individual links override with their own `prefetch` prop, including `prefetch={false}` to opt out. Off by default.
- `prefetchHoverDelayMs` cancellable hover-intent delay for prefetching links. Focus and touchstart remain immediate. Default: `50`; set to `0` for immediate hover prefetching.
- `pendingDelayMs` how long `<DelayedSuspense>` holds the previous route before rendering its fallback during an in-flight navigation. Default: `1000`.

#### Path patterns

Route matching is segment-based. Query strings and hashes are parsed into the route but do not participate in path matching.

| Pattern | Meaning | Example result |
| --- | --- | --- |
| `/settings` | Exact static path | Matches `/settings` (with or without a trailing slash) |
| `/people/:id` | One required segment | `/people/42` gives `params.id === '42'` |
| `/people/:id?` | Zero or one segment | `/people` gives `params.id === ''` |
| `/files/:path+` | One or more remaining segments | `/files/a/b` gives `params.path === 'a/b'` |
| `/files/:path*` | Zero or more remaining segments | `/files` gives `params.path === ''` |
| `*` | Whole-pattern wildcard | Matches any URL and adds no named param |

Static segments are case-sensitive. Parameter names use letters, numbers, and underscores. `+` and `*` parameters consume the remainder of the pathname and should be the final segment. Parameters are decoded safely; malformed percent escapes are left as written instead of crashing matching.

Routes are checked in declaration order and the first match wins, so put a catch-all `*` route last. A nested route's `path` is still a complete pattern—nesting builds the matched component/data hierarchy but does not prefix child paths automatically.

#### Redirects

A route can redirect to any target accepted by `navigate()`. Static redirects are concise:

```js
{ path: '/old-settings', redirect: '/settings' }
```

A function receives the matched route and can preserve params, query, or other state:

```js
{
  path: '/people/:id',
  redirect: route => ({
    pathname: '/employees/:id',
    params: route.params,
    query: route.query,
  }),
}
```

Redirects are resolved before component loading, data preparation, or React rendering and always replace the current history entry. A redirect can be declared on any segment in a matched nested branch. Redirect loops throw after ten redirects.

#### Query transform

```tsx
function transformQuery(query, { to, sourceRoute, targetRoute }) {
  const policy = targetRoute.data.at(-1)?.queryPolicy
  if (!policy) return query

  return { ...query, scope: policy.defaultScope }
}

<Router routes={routes} transformQuery={transformQuery}>...</Router>
```

The transform runs while an app-created destination URL is being built. Its context contains:

- `to` — the original string or target object supplied by the app.
- `sourceRoute` — the latest route at that call site, or `null` before the first commit.
- `targetRoute` — the route matched from the original destination before the query transform, including its route `data`.

The returned object is serialized with the Router's `qs` codec. Return `{}` or `null` for no query; properties whose values are `undefined` follow the codec's deletion behavior. Pathname, params, hash, and `replace` remain unchanged.

One target-building pipeline is shared by `useNavigate`, `useSpaceRouter().navigate`, `useSpaceRouter().href`, `useMakeHref`, `useLinkProps`, `<Link>`, `<Navigate>`, `usePrefetch`, and link prefetch. URL strings and `{ url }` targets are matched and processed too. A link's rendered `href`, click, and prefetch therefore use the same resolved URL.

Initial/direct URLs and browser back/forward traversal bypass `transformQuery`, preserving the exact historical URL. Browser-owned targets — external/protocol URLs and same-page fragments such as `#section` — bypass it too, even when the route table contains a wildcard. In hash mode, `#/path` is an app route and is transformed; `#section` is not. The function may run during rendering and whenever callers request an href, so it must be pure, synchronous, and safe to repeat.

### `<Routes />`

```js
<Routes />
```

Renders the components matched from the enclosing `<Router routes={routes}>` at this location. Nested ancestor segments wrap their descendants automatically — parents render `{children}` to position the matched child. Segments without a `component` or `resolver` are transparent wrappers for their descendants.

When a navigation happens, every matched segment's `resolver()` is preloaded and every matched segment's `prepare()` is called, so chunk download and data loading can overlap. Preparation synchronously starts or pins work and returns lifecycle handles; the router does not await the underlying requests before committing. The destination's nearest `<Suspense>` boundary handles any still-cold reads. This includes cold direct loads: the initial route's `resolver()` and `prepare()` are kicked off during the first render, before its components read from the data cache.

Props:

- `disableScrollToTop` disables automatic scrolling. By default, app-created navigation with a hash fragment scrolls to that element after the route commits, falling back to the top if it is not found; other app-created navigation to a different pathname or `scrollGroup` scrolls to the top. Browser Back/Forward traversal is left to native scroll restoration. Fragment scrolling is best-effort: a target rendered later behind a nested Suspense boundary may not exist at commit time.

#### Path params as component props

When the router commits a route, it spreads matched path params onto route segment components as own props. Each segment receives only the params declared in its own `path` — wrapping layouts that didn't declare those params get nothing extra, while a parent layout that declares `:orgId` receives `orgId` and a child leaf that declares `:issueId` receives `issueId`.

```js
const routes = [
  {
    path: '/issues/:id',
    resolver: () => import('./pages/IssueDetail'),
    prepare: ({ params }) => [
      figbird.prepare(issueDetail, { id: Number(params.id) }),
    ],
  },
]

// In ./pages/IssueDetail
export default function IssueDetail({ id }) {
  // `id` is injected from the route's `:id` segment.
}
```

If you also need cross-cutting access from a parent layout, reach for `useRoute()` from there.

### `<BlockNavigation />`

Guards navigation for as long as it is mounted. Pass `message` for a native confirmation dialog, or render-function `children` for custom UI; the two modes are mutually exclusive.

```ts
type BlockNavigationProps =
  | { message?: string; children?: never }
  | {
      message?: never
      children: (controls: {
        proceed(): void
        cancel(): void
      }) => ReactNode
    }
```

With neither prop, the native message is `Discard unsaved changes?`. See [Blocking navigation](#blocking-navigation) for behavior and browser coverage.

### `PreparedHandle`

The shape returned by `prepare()` functions. The router collects these from every matched segment, pins them while the route is committed, and calls `release()` when the next navigation commits or `<Router>` unmounts.

```ts
interface PreparedHandle {
  release(): void
}
```

The router stores the handles and calls `release()`. Extra fields on a data layer's handle are ignored, so richer handles such as figbird's `{ key, promise, release }` satisfy this contract directly.

### `<DelayedSuspense />`

```js
<DelayedSuspense fallback={<Skeleton />}>
  <Panel />
</DelayedSuspense>
```

A router-aware `Suspense` boundary. During an in-flight route transition it re-throws its fallback for the first `pendingDelayMs` milliseconds, which lets the already-committed outer route stay on screen. After the threshold, or outside a pending navigation, it behaves like regular `Suspense` and renders its fallback.

Use it for routes where you want to avoid flashing a skeleton for fast navigations but still show a loading state for slower data.

### `<Link />`

```js
<Link href='/profile/32' className='nav' replace />
```

Renders an `<a>` with a correct `href` and `onClick` handler that intercepts the click and pushes a history entry instead of triggering a full page reload. Preserves cmd/ctrl/shift/alt + click and middle-click for new-tab/window/download behavior.

Props:

- `href` navigation target — a `string` or an object with:
  - `pathname` the pathname portion, may include named segments.
  - `params` params to interpolate into the pathname.
  - `query` query object passed through `qs.stringify`.
  - `hash` hash fragment.
  - `merge` merge partial `to` object into the current route.
- `replace` replace the current entry in the navigation stack instead of pushing.
- `current` set to true/false to override automatic current-page detection.
- `prefetch` warm the target route speculatively: `true`/`'hover'` after the Router's cancellable hover-intent delay, but immediately on focus and touch; `'visible'` when the link scrolls into view. Overrides the Router-level `prefetchLinks` default in either direction.
- `onClick` user click handler. Runs before the router's internal click handling; call `event.preventDefault()` to stop SPA navigation.
- `ref` is forwarded to the rendered anchor, including when visibility prefetching also observes it.

The rest of the props are spread onto the `<a>` element.

Active links receive `aria-current="page"` and links whose navigation is in flight receive `data-pending`, so both states should usually be styled in plain CSS:

```css
.nav-link[aria-current='page'] {
  font-weight: 600;
}
.nav-link[data-pending] {
  opacity: 0.6;
}
```

### `<Navigate />`

```js
<Navigate to={{ pathname: '/' }} />
```

Redirects to the target URL on mount.

Props:

- `to` `string` or object — same shape as `useNavigate`'s argument.

### `useSpaceRouter`

```js
const router = useSpaceRouter()
```

Get the underlying Space Router instance. See [space-router docs](https://kidkarolis.github.io/space-router/) for details. Rarely needed — the other hooks cover the common cases.

### `useRoute`

```js
const route = useRoute()
```

Subscribe to the current route, or `null` when the current URL does not match the router's route table. On an unmatched URL, `<Routes>` renders nothing and the prior route's preparation handles are released. A matched initial route is available synchronously throughout `<Router>`, including components rendered outside `<Routes>`. The route has the shape `{ url, pathname, params, query, search, hash, pattern, data }`:

- `url` full relative URL string including query string and hash if any.
- `pathname` the pathname portion.
- `params` params extracted from named pathname segments.
- `query` query object parsed via `qs.parse`.
- `search` full unparsed query string.
- `hash` hash fragment.
- `pattern` the matched route pattern from the route config.
- `data` array of nested matched route objects (with components and any custom metadata).

### `usePreviousRoute`

```js
const previousRoute = usePreviousRoute()
```

The route immediately preceding the current successfully committed route, or `null` on the initial route. It is available to a destination component on its first render, making it suitable for contextual back links and post-navigation effects.

If route A is current while B is pending, `usePreviousRoute()` continues to describe the route before A. Once B commits, it returns A. Suspended destinations that never commit, superseded navigations, and unmatched URLs do not advance it. Browser back/forward traversal does, and an intentional same-URL commit returns the prior route object even though both objects have the same URL.

Both the current and previous routes are post-`transformRoute`.

### `usePending`

```js
const pending = usePending()
```

`true` while the router is between navigation start and commit. Backed by React's `useTransition` — flips on as soon as `navigate()` runs and flips off once the destination has committed and the transition has settled.

Use this for top-of-page progress bars and "your click did something" affordances:

```js
function LoadingBar() {
  const pending = usePending()
  return pending ? <Bar /> : null
}
```

Don't use it for skeletons — those belong in destination Suspense boundaries.

### `usePendingRoute`

```js
const pendingRoute = usePendingRoute()
```

The route the router is currently transitioning toward, or `null` when idle. Set for every navigation source — link clicks, programmatic `navigate()`, and browser back/forward — from commit until the transition settles. Like `useRoute()`, the returned route is post-`transformRoute`.

Where `usePending()` answers "is a navigation happening", `usePendingRoute()` answers "where to". Use it for destination-aware pending UI: highlighting the requested item in a list, fading the surface being replaced, or reading the destination's `params` before it commits:

```tsx
function ItemList({ currentId }) {
  const pendingRoute = usePendingRoute()
  const pendingItemId = pendingRoute?.pattern === '/items/:id' ? pendingRoute.params.id : null
  const isFading = pendingItemId != null && pendingItemId !== currentId
  // fade the current detail while the next item loads...
}
```

### `useNavigate`

```js
const navigate = useNavigate()

navigate('/shows')
navigate({ url: '/show/1' })
navigate({ url: '/show/2', replace: true })
navigate({ pathname: '/shows', query: { 'most-recent': 1 } })
navigate({ query: { 'top-rated': 1 }, merge: true })
navigate({ query: { 'top-rated': undefined }, merge: true })
```

Get the `navigate` function for performing programmatic navigations. Accepts a `string` URL or an object:

- `url` URL string.
- `pathname` pathname portion, may include named segments.
- `params` params to interpolate.
- `query` query object passed through `qs.stringify`.
- `hash` hash fragment.
- `merge` merge partial `to` into the current route.
- `replace` replace the current history entry instead of pushing.

The returned function is stable and resolves merged targets against the latest committed route. Consecutive identical outstanding requests from the same source route are coalesced; an intervening destination remains allowed, and the same URL can be navigated again after a commit.

### `useLinkProps`

```js
const linkProps = useLinkProps(to)
<a {...linkProps} />
```

Returns `{ href, aria-current, data-pending, onClick }` so you can build your own anchor and get full router behavior without using `<Link />`. Everything returned is spreadable — current and pending state ride along as attributes, so both can be styled in plain CSS:

```css
a[aria-current='page'] {
  font-weight: 600;
}
a[data-pending] {
  opacity: 0.6;
}
```

Takes a `string` URL or an object — same fields as `useNavigate`, plus:

- `current` override automatic current-page detection.
- `prefetch` warm the target route speculatively (see [Prefetching](#prefetching)). When set, the returned props also carry the trigger — hover/focus/touch handlers, or a `ref` for `'visible'` — so the spread keeps working unchanged.

### `useLinkState`

```js
const { isCurrent, isPending } = useLinkState(to)
```

Per-target link state for logic that cannot be expressed in CSS. Takes the same target as `useLinkProps`, but works for any navigable UI, not just anchors — tab strips, sidebar items, breadcrumb spinners:

```tsx
const linkProps = useLinkProps('/settings')
const { isCurrent } = useLinkState('/settings')

return <a {...linkProps}>{isCurrent ? 'Settings' : 'Go to settings'}</a>
```

### `usePrefetch`

```js
const prefetch = usePrefetch()
prefetch('/issues/42')
```

Returns a function that warms a navigation target without navigating: applies `transformQuery`, matches the resulting URL, applies `transformRoute`, preloads matched `resolver` chunks, and calls each matched segment's `prefetch(ctx)`. Fire-and-forget and safe to call repeatedly — the data layer owns freshness. Unmatched URLs are a no-op.

`<Link prefetch>` uses this internally; call it directly for custom triggers — a form submit that predicts the next screen, viewport logic the router doesn't own:

```js
const prefetch = usePrefetch()

async function onSubmit(values) {
  prefetch(`/orders/${values.orderId}`) // warm the confirmation screen
  await submit(values)
  navigate(`/orders/${values.orderId}`)
}
```

Takes a `string` URL or an object — same fields as `useNavigate`.

### `useMakeHref`

```js
const makeHref = useMakeHref()
makeHref(to)
```

Create a relative URL string to use in `<a href>`.

- `to` object of shape `{ pathname, params, query, hash }`. The `params` interpolate into named pathname segments; `query` is stringified via `qs.stringify`.

Without `transformQuery`, a string or `{ url }` is returned as-is. With the transform, those forms go through the same matched destination-query pipeline as object targets and navigation, so generated hrefs remain interchangeable with `navigate`.

### `shouldNavigate`

```js
shouldNavigate(e)
```

Check whether a click event should result in a router navigation or be left to the browser. Used internally by `<Link />`. Returns `false` for:

- cmd/ctrl/alt/shift + click
- middle mouse click
- `e.defaultPrevented`
- target=\_blank or other non-self targets
- `download` attribute
- cross-origin or non-http(s) URLs
- same-page `#hash` links — the browser scrolls to the anchor natively
