---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

> [Space Router](https://kidkarolis.github.io/space-router/) bindings for React

React Space Router is a set of hooks and components for keeping your app in sync with the URL and performing page navigations. Suspense-aware and built around React's transition machinery. A library built by and used at [Humaans](https://humaans.io/).

- React hooks based
- Nested routes
- Code-split routes via `resolver` (`React.lazy` under the hood)
- Per-route `prepare(ctx)` for fetch-as-you-render data loading
- Pending state via `usePending()` (backed by `useTransition`)
- Optional pre-commit `transformRoute` hook for URL rewrites
- Built in query string parser
- Scrolls to top after navigation
- Preserves cmd/ctrl/alt/shift click and mouse middle click

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework-agnostic tiny core that handles URL listening, route matching, and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility for modern Suspense-driven UIs.

## Install

```sh
$ npm install react-space-router
```

## Example

```js
import React, { Suspense, useEffect } from 'react'
import {
  Router,
  Routes,
  Link,
  useRoute,
  useNavigate,
  defineRoutes,
} from 'react-space-router'

const routes = defineRoutes([
  { path: '/', component: Home },
  {
    component: SettingsContainer,
    routes: [
      { path: '/settings', component: Settings },
      { path: '/settings/billing', resolver: () => import('./Billing') },
    ],
  },
])

function App() {
  return (
    <Router>
      <Suspense fallback={null}>
        <Routes routes={routes} />
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

## API

### `<Router />`

Wraps the application and provides router context and state. Route state lives inside the router (`useState` + `useTransition`); commits are wrapped in a transition so Suspense can keep the previous route on screen while the next one prepares.

Props:

- `mode` one of `history`, `hash`, `memory` — default is `history`.
- `qs` a custom query string parser of shape `{ parse, stringify }`.
- `sync` if `true`, the underlying space-router fires synchronous transitions (useful in tests).
- `transformRoute(route)` an optional pure, synchronous function that runs between match and commit. Return a modified `Route` to change what gets committed; if its `url` differs from the matched URL, the router calls `history.replaceState` so the address bar matches. Use this for things like persisted-query restoration. Must not be async.

### `<Routes />`

```js
<Routes routes={[{ path: '/', component: Home }]} />
```

Renders the components that match the current route based on the route config. Nested ancestor segments wrap their descendants automatically — parents render `{children}` to position the matched child.

When a navigation happens, every matched segment's `resolver()` and `prepare()` fire in parallel, so chunk download and data loading overlap. The destination's nearest `<Suspense>` boundary handles any still-cold reads.

Props:

- `routes` an array of route definitions, where each route is an object of shape `{ path, component, resolver, prepare, navigation, props, redirect, scrollGroup, routes, ...metadata }`:
  - `path` URL pattern, may include `:named` segments.
  - `component` a React component to render. Accepts an ESM-default module shape (`{ default: Component }`) too.
  - `resolver` `() => import('./Screen')` — a dynamic import. The router preloads this at navigation time and renders via `React.lazy`. Cold imports suspend at the destination's Suspense boundary.
  - `prepare(ctx)` a function called at navigation time with `{ pathname, url, params, query }`. Returns an array of `PreparedHandle` objects (e.g. from a data layer's `prepare()` call). The router pins them for the lifetime of the committed navigation and releases them when the next navigation commits.
  - `navigation` per-route navigation options. Currently supports `commit: 'immediate'` (the only mode). `commit: 'ready'` is reserved for a future release.
  - `props` props to pass to the segment's component.
  - `redirect` a string or `(route) => to` redirecting upon entering this route.
  - `scrollGroup` a string that groups routes; navigations within a group don't scroll to top.
  - `routes` nested route definitions.
  - `...metadata` any other keys you want — they're available on `route.data[i]`.
- `disableScrollToTop` disables the scroll-to-top behavior after each navigation.

### `defineRoute` / `defineRoutes`

```js
import { defineRoute, defineRoutes } from 'react-space-router'

const routes = defineRoutes([
  defineRoute({
    path: '/issues/:id',
    resolver: () => import('./pages/IssueDetail'),
    prepare: ({ params }) => [
      figbird.prepare(issueDetail, { id: Number(params.id) }),
    ],
  }),
])
```

Identity helpers for type-checking route shapes. They have no runtime behavior — the returned value is the input.

### `PreparedHandle`

The shape returned by `prepare()` functions. The router collects these from every matched segment, pins them while the route is committed, and calls `release()` when the next navigation commits or `<Routes>` unmounts.

```ts
interface PreparedHandle {
  promise: Promise<unknown>
  release(): void
  priority?: 'route' | 'defer'
  key?: string | number
}
```

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
- `onClick` user click handler. Runs before the router's internal click handling; call `event.preventDefault()` to stop SPA navigation.

The rest of the props are spread onto the `<a>` element.

Active links receive `aria-current="page"`, so active styling should usually be plain CSS:

```css
.nav-link[aria-current='page'] {
  font-weight: 600;
}
```

### `<Navigate />`

```js
<Navigate to={{ pathname: '/' }} />
```

Redirects to the target URL on mount.

Props:

- `to` `string` or object — same shape as `useNavigate`'s argument.

### `useInternalRouterInstance`

```js
const router = useInternalRouterInstance()
```

Get the underlying Space Router instance. See [space-router docs](https://kidkarolis.github.io/space-router/) for details. Rarely needed — the other hooks cover the common cases.

### `useRoute`

```js
const route = useRoute()
```

Subscribe to the current route. Route is an object of shape `{ url, pathname, params, query, search, hash, pattern, data }`:

- `url` full relative URL string including query string and hash if any.
- `pathname` the pathname portion.
- `params` params extracted from named pathname segments.
- `query` query object parsed via `qs.parse`.
- `search` full unparsed query string.
- `hash` hash fragment.
- `pattern` the matched route pattern from the route config.
- `data` array of nested matched route objects (with components and any custom metadata).

Route components rendered by `<Routes>` receive the initial route synchronously. Components outside `<Routes>` can still see `null` before the route table has mounted.

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

### `useLinkProps`

```js
const linkProps = useLinkProps(to)
<a {...linkProps} />
```

Returns `{ href, aria-current, onClick, isCurrent, isPending }` so you can build your own anchor and get full router behavior without using `<Link />`. `isCurrent` and `isPending` are non-enumerable, so `<a {...useLinkProps(to)} />` stays safe, but you can still read them for active and per-link loading UI.

Takes a `string` URL or an object — same fields as `useNavigate`, plus:

- `current` override automatic current-page detection.

For programmatic active-aware UI, read `isCurrent` from the returned props:

```tsx
const linkProps = useLinkProps('/settings')

return (
  <a {...linkProps} className={cn('nav-link', linkProps.isCurrent && 'active')}>
    Settings
  </a>
)
```

### `useMakeHref`

```js
const makeHref = useMakeHref()
makeHref(to)
```

Create a relative URL string to use in `<a href>`.

- `to` object of shape `{ pathname, params, query, hash }`. The `params` interpolate into named pathname segments; `query` is stringified via `qs.stringify`.

If `to` is a string, `makeHref` returns it as-is. Same for `{ url }` — this matches `navigate`'s signature so the two are interchangeable.

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

## Migrating from 0.6.x

See [MIGRATION.md](https://github.com/humaans/react-space-router/blob/master/MIGRATION.md) for the full migration guide. Headlines:

- `onNavigating`/`onNavigated`/`useRoute` props have been removed from `<Router>`. Route state lives inside the router now.
- Use `resolver` on a route segment instead of awaiting `import()` in `onNavigating`.
- Use `usePending()` instead of a manual `navigating: true/false` flag.
- Use `transformRoute` for the one case that actually needs a pre-commit hook (e.g. persisted-query restoration).
- Replace external Redux/Zustand/atom-backed route state with direct `useRoute()` reads.
