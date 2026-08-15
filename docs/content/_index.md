---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

React Space Router is a minimal, Suspense-first router for React. It uses React’s own transition model to load routes and data, keeping navigation fluid and the API refreshingly simple. Built and used at [Humaans](https://humaans.io/).

- Control loading UI with Suspense boundaries: show destination skeletons, delay fallbacks for quick loads, or keep the current page visible until the next route is ready.
- Show immediate navigation feedback with pending state, from a spinner on the action to destination-aware tabs, sidebars, and breadcrumbs.
- Nest and lazy-load routes, with path parameters passed directly to route components.
- Declare route data once, then prepare or prefetch it through an adapter that works with any data layer.
- Prefetch route code and data on hover, focus, touch, or visibility.
- Use previous route state to build contextual back links.
- Block navigation with a browser prompt or your own confirmation UI.

## Why

"Perfection is achieved when there is nothing left to take away." That idea guides React Space Router. It builds on Space Router, a small framework-agnostic core for URL listening, route matching, and navigation. The React layer adds nested rendering, Suspense-aware loading, transition state, and data preparation without taking over your data layer.

## Scope

React Space Router is designed for client-rendered single-page applications. Server-side rendering is intentionally out of scope.

## Install

```sh
$ npm install react-space-router@next
```

## Quick start

```jsx
import { Suspense } from 'react'
import { Router, Routes, Link, useNavigate } from 'react-space-router'

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
  return (
    <div>
      <h1>Home</h1>
      <Link href='/settings'>Settings</Link>
    </div>
  )
}

function Settings() {
  const navigate = useNavigate()

  return (
    <div>
      <h1>Settings</h1>
      <button onClick={() => navigate('/settings/billing')}>Billing</button>
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

The [live demo](https://humaans.github.io/react-space-router/demo/) shows these modes side by side over simulated latencies, or run it locally with `npm run demo`.

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

## Prefetching

Prefetching warms the route the user is likely to visit next. The usual setup is: declare data once on the route with `queries`, give `<Router>` a data adapter, then opt links into prefetching.

```js
import { prepare, prefetch } from './figbird'

const routes = [
  {
    path: '/issues/:id',
    resolver: () => import('./pages/IssueDetail'),
    queries: ({ params }) => [issueDetail.withArgs({ id: +params.id })],
  },
]

<Router routes={routes} data={{ prepare, prefetch }}>...</Router>
<Link href={`/issues/${id}`} prefetch />
```

On navigation, each opaque query request runs through `data.prepare(request)` and the returned handles stay pinned until the route changes. On prefetch, the same request runs through `data.prefetch(request)` and the return value is ignored. The data layer owns argument binding and validation; the router only owns when requests are prepared and released. Resolver chunks are warmed too.

`<Link prefetch>` means cancellable hover intent (50ms by default) plus immediate focus/touch. Use `prefetch='visible'` for viewport-based prefetching, `<Router prefetchLinks>` to make prefetching the default for all links, and `prefetch={false}` to opt one link out. Configure the hover delay with `<Router prefetchHoverDelayMs={50}>`; `0` restores immediate hover prefetching. A route segment can set `prefetchable: false` to skip its own speculative work while still preparing normally on real navigation. Other matched segments still prefetch unless they also opt out.

For unusual cases, use route-level `prepare(ctx)` / `prefetch(ctx)` directly, or call `usePrefetch()` from your own trigger.

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

## API reference

### `<Router />`

Wraps the application and provides router context and state. Route state lives inside the router (`useState` + `useTransition`); commits are wrapped in a transition so Suspense can keep the previous route on screen while the next one prepares.

Props:

- `routes` an array of [route definitions](#route-definitions). Each definition can match a path, render or lazy-load a component, prepare data, redirect, and contain nested routes.
- `mode` one of `history`, `hash`, `memory` — default is `history`.
- `qs` a custom query string parser of shape `{ parse, stringify }`.
- `sync` if `true`, the underlying space-router fires synchronous transitions (useful in tests).
- `transformRoute(route)` an optional pure, synchronous route transform. See [Route transform](#route-transform).
- `transformQuery(query, { to, sourceRoute, targetRoute })` an optional pure, synchronous mapping for the query of app-created destinations. It returns the query serialized by the configured `qs` codec, or `null` to remove the query. See [Query transform](#query-transform).
- `data` a data adapter of shape `{ prepare(request), prefetch(request) }` that bridges route `queries` to a data layer (see [Prefetching](#prefetching)). Requests are opaque to the router; `prepare` returns a `PreparedHandle` and `prefetch` warms speculatively. Should be referentially stable; required only if a route uses `queries`.
- `prefetchLinks` default prefetch trigger for every link: `true`/`'hover'` or `'visible'`. Individual links override with their own `prefetch` prop, including `prefetch={false}` to opt out. Off by default.
- `prefetchHoverDelayMs` cancellable hover-intent delay for prefetching links. Focus and touchstart remain immediate. Default: `50`; set to `0` for immediate hover prefetching.
- `pendingDelayMs` how long `<DelayedSuspense>` holds the previous route before rendering its fallback during an in-flight navigation. Default: `1000`.

#### Route definitions

A route definition describes one segment of a matched route. It can render a component, lazy-load one, prepare data, redirect, or group nested routes.

```js
const routes = [
  { path: '/', component: Home },
  {
    component: SettingsLayout,
    routes: [
      { path: '/settings', component: Settings },
      {
        path: '/settings/billing',
        resolver: () => import('./Billing'),
      },
    ],
  },
]
```

Pass the array to `<Router routes={routes}>`. Each definition can use these fields:

- `path` an optional, complete URL pattern. See [Path patterns](#path-patterns).
- `redirect` a navigation target, or `(route) => target`. Redirects replace the current history entry before the route reaches React. See [Redirects](#redirects).
- `guard(ctx)` a synchronous admission check. Return a navigation target to redirect before preparation, or `undefined` to admit the route. See [Route guards](#route-guards).
- `component` a React component to render. It also accepts an ESM-default module shape such as `{ default: Component }`.
- `resolver` a dynamic import such as `() => import('./Screen')`. The router preloads it at navigation time and renders it with `React.lazy`. A cold import suspends at the destination's Suspense boundary.
- `queries` declares the route's data needs once as a static array of opaque requests, or as `queries(ctx)` when requests depend on route context. The `<Router data>` adapter prepares them on navigation and prefetches them during speculation. Requires a `data` adapter. See [Prefetching](#prefetching).
- `prepare(ctx)` is the low-level alternative to `queries` for navigation. It receives `{ pathname, url, params, query }` and returns handles that stay pinned for the committed navigation. Setup is synchronous and must not throw; surface request errors later through the data cache's Suspense read path.
- `prefetch(ctx)` is the low-level alternative to `queries` for prefetching. It runs when a prefetching link warms the route, may run at any frequency, and ignores its return value.
- `prefetchable` set to `false` skips speculative resolver, `prefetch`, and query work for this segment while preserving normal preparation during navigation. Other matched segments still prefetch unless they also opt out. It overrides an explicit `<Link prefetch>` for this segment.
- `props` props passed to the segment's component.
- `scrollGroup` a string set on the destination's final matched definition. App-created navigation between destinations in the same group does not scroll to the top unless the destination includes a hash fragment.
- `routes` nested route definitions.
- `...metadata` any other fields you need. They are available on `route.data[i]`.

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

A route can redirect to any [navigation target](#navigation-targets). Static redirects are concise:

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

#### Route guards

Use `guard(ctx)` when admission depends on synchronous application state that is already known before the router mounts. Guards receive `{ pathname, url, params, query }` and run parent-first:

```js
{
  guard: ({ url }) => session.user
    ? undefined
    : { pathname: '/login', query: { returnPath: url } },
  routes: [
    { path: '/settings', component: Settings },
  ],
}
```

Like redirects, guards resolve before resolver loading, route preparation, query preparation, speculative prefetching, or rendering. Redirected destinations are resolved through their own guards, with loops rejected after ten redirects.

Guards may run during rendering and prefetching, so they must be pure, synchronous, and safe to repeat. Resolve asynchronous prerequisites such as restoring a persisted session before mounting `<Router>`; use guards only to apply the resulting synchronous policy.

#### Prepared handles

`data.prepare()` returns one `PreparedHandle`; a route-level `prepare(ctx)` returns an array of them or nothing:

```ts
interface PreparedHandle {
  release(): void
}
```

The router keeps committed handles pinned until the next route commits or `<Router>` unmounts. If a pending navigation is superseded before commit, its handles are released immediately. Extra fields on a data layer's handle are ignored, so richer handles such as figbird's `{ key, promise, release }` satisfy this contract directly.

#### Route transform

`transformRoute(route)` runs after matching and before route preparation, speculative prefetching, or commit. Return a modified route to change what is prepared and rendered; return `undefined` to keep the matched route unchanged.

If the transformed route changes `route.url` during navigation, the router silently replaces the browser URL using the current routing mode. The function can run during rendering and prefetching, so it must be pure, synchronous, and safe to repeat.

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

#### Navigation targets

Redirects and navigation APIs — including `<Link>`, `<Navigate>`, `useNavigate`, `useSpaceRouter().navigate()`, `useSpaceRouter().href()`, `useLinkProps`, `useLinkState`, `usePrefetch`, and `useMakeHref` — accept a URL string or a target object with these fields:

- `url` a complete URL. When supplied, `pathname`, `params`, `query`, and `hash` are not used to build the URL.
- `pathname` a pathname or path pattern, which may contain named segments.
- `params` values to interpolate into named pathname segments.
- `query` an object serialized by the configured `qs` codec. With `merge: true`, `null` clears the current query.
- `hash` a fragment string. With `merge: true`, `null` clears the current hash.
- `merge` resolves omitted fields and partial params or query against the current route.
- `replace` replaces the current history entry instead of pushing one. It affects navigation, not a generated `href`.

### `<Routes />`

```js
<Routes />
```

Renders the components matched from the enclosing `<Router routes={routes}>` at this location. Nested ancestor segments wrap their descendants automatically — parents render `{children}` to position the matched child. Segments without a `component` or `resolver` are transparent wrappers for their descendants.

When a navigation happens, every matched segment's `resolver()` is preloaded, every `prepare()` is called, and declared `queries` run through `data.prepare()`, so chunk download and data loading can overlap. Preparation synchronously starts or pins work and returns lifecycle handles; the router does not await the underlying requests before committing. The destination's nearest `<Suspense>` boundary handles any still-cold reads. This includes cold direct loads: the initial route's resolver and preparation work start during the first render, before its components read from the data cache.

Props:

- `disableScrollToTop` disables automatic scrolling. By default, app-created navigation with a hash fragment scrolls to that element after the route commits, falling back to the top if it is not found; other app-created navigation to a different pathname or `scrollGroup` scrolls to the top. Browser Back/Forward traversal is left to native scroll restoration. Fragment scrolling is best-effort: a target rendered later behind a nested Suspense boundary may not exist at commit time.

#### Path params as component props

When the router commits a route, it spreads matched path params onto route segment components as own props. Each segment receives only the params declared in its own `path` — wrapping layouts that didn't declare those params get nothing extra, while a parent layout that declares `:orgId` receives `orgId` and a child leaf that declares `:issueId` receives `issueId`.

Static `props` from the route definition are spread last, so they override an injected path param with the same name.

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

### `<DelayedSuspense />`

```js
<DelayedSuspense fallback={<Skeleton />}>
  <Panel />
</DelayedSuspense>
```

A router-aware `Suspense` boundary. For the first `pendingDelayMs` milliseconds of an in-flight route transition, it suppresses its own fallback and lets suspension reach an outer boundary, which can keep the already-committed route on screen. After the threshold, or outside a pending navigation, it behaves like regular `Suspense` and renders its fallback.

Use it for routes where you want to avoid flashing a skeleton for fast navigations but still show a loading state for slower data.

### `<Link />`

```js
<Link href='/profile/32' className='nav' replace />
```

Renders an `<a>` with the correct `href` and client-side click handling, so in-app navigation does not reload the page. It pushes a history entry by default and replaces the current entry when `replace` is set. Preserves cmd/ctrl/shift/alt + click and middle-click for new-tab/window/download behavior.

Props:

- `href` a [navigation target](#navigation-targets).
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

Starts a client-side navigation after it mounts. It pushes a history entry by default; set `replace: true` on the object target to replace the current entry.

Props:

- `to` a [navigation target](#navigation-targets).

### `useSpaceRouter`

```js
const router = useSpaceRouter()
```

Get the Space Router-compatible instance used by React Space Router. Its `navigate()` and `href()` methods use the same target-processing pipeline as the components and hooks, while `match()` uses the same route table. See the [Space Router docs](https://kidkarolis.github.io/space-router/) for details. Rarely needed — the other hooks cover the common cases.

### `useRoute`

```js
const route = useRoute()
```

Subscribe to the current matched route. `useRoute()` returns a route directly and throws when the current URL does not match the router's route table; add a wildcard route when unmatched URLs should still render within the application. On an unmatched URL, `<Routes>` renders nothing and the prior route's preparation handles are released. A matched initial route is available synchronously throughout `<Router>`, including components rendered outside `<Routes>`. The route has the shape `{ url, pathname, params, query, search, hash, pattern, data }`:

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

`true` while React's route transition is pending. It turns on when navigation starts and turns off when the destination transition settles. Backed by React's `useTransition`.

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

The route the router is currently transitioning toward, or `null` when idle. It becomes available after the destination is matched, transformed, and prepared, then clears when the transition settles. This covers every navigation source — link clicks, programmatic `navigate()`, and browser back/forward. Like `useRoute()`, the returned route is post-`transformRoute`.

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

Get the `navigate` function for performing programmatic navigations. It accepts any [navigation target](#navigation-targets).

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

Takes a [navigation target](#navigation-targets), plus:

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

Takes any [navigation target](#navigation-targets).

### `useMakeHref`

```js
const makeHref = useMakeHref()
makeHref(to)
```

Create a relative URL string to use in `<a href>`. It accepts any [navigation target](#navigation-targets); `replace` affects navigation only and does not change the generated URL.

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
