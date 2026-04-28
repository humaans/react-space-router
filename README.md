<p align="center">
  <img width="360" src="https://user-images.githubusercontent.com/324440/140424786-813d7ace-6ec6-45ad-af6e-9318180786c5.png" alt="react space router logo, a skeleton floating in space with a react logo for the head" title="react-space-router">
</p>

<h1 align="center">React Space Router</h1>
<h4 align="center"><a href="https://github.com/KidkArolis/space-router">Space Router</a> bindings for React</a></h4>
<br />

React Space Router is a set of hooks and components for keeping your app in sync with the URL and performing page navigations. Suspense-aware and built around React's transition machinery. A library built by and used at [Humaans](https://humaans.io/).

- React hooks based
- Nested routes
- Code-split routes via `resolver` (`React.lazy` under the hood)
- Per-route `prepare(ctx)` for fetch-as-you-render data loading
- Pending state via `usePending()` (backed by `useTransition`)
- Delayed route fallbacks via `<DelayedSuspense>`
- Optional pre-commit `transformRoute` hook for URL rewrites
- Path params injected as component props
- Built in query string parser
- Scrolls to top after navigation, with `scrollGroup` support
- Preserves cmd/ctrl/alt/shift click and mouse middle click

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework agnostic tiny core that handles URL listening, route matching and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility for modern Suspense-driven UIs.

## Install

```sh
$ npm install react-space-router
```

## API

```tsx
import { Suspense } from 'react'
import { Router, Routes, Link, DelayedSuspense } from 'react-space-router'

const routes = [
  { path: '/', component: Home },
  {
    path: '/issues/:id',
    resolver: () => import('./IssueDetail'),
    prepare: ({ params }) => [
      issueStore.prepare({ id: Number(params.id) }),
    ],
  },
]

export function App() {
  return (
    <Router pendingDelayMs={1000}>
      <Suspense fallback={null}>
        <Routes routes={routes} />
      </Suspense>
    </Router>
  )
}

function Home() {
  return <Link href='/issues/123'>Open issue</Link>
}

function IssueSection() {
  return (
    <DelayedSuspense fallback={<Skeleton />}>
      <IssueContent />
    </DelayedSuspense>
  )
}
```

### Core components

- `<Router>` owns route state internally and commits route changes inside React transitions. Props: `mode`, `qs`, `sync`, `transformRoute`, `pendingDelayMs`.
- `<Routes>` matches the current URL, preloads matched `resolver()` chunks, runs matched `prepare(ctx)` functions, pins returned handles, renders nested route segments, injects each segment's own path params as props, and handles scroll-to-top.
- `<Link>` renders an anchor with SPA navigation while preserving modified clicks, middle click, downloads, external URLs, and user `onClick` cancellation.
- `<Navigate>` performs a navigation on mount.
- `<DelayedSuspense>` behaves like `Suspense`, except during an in-flight router transition it holds the previous route until `pendingDelayMs` has elapsed, then renders its fallback.

### Hooks

- `useRoute()` returns the current route: `{ url, pathname, params, query, search, hash, pattern, data }`.
- `useNavigate()` returns a programmatic navigation function accepting a string URL or Space Router target object.
- `usePending()` returns React transition pending state for route navigation.
- `useLinkProps(to)` returns anchor props plus non-enumerable `isCurrent` and `isPending`.
- `useMakeHref()` returns the underlying `router.href` helper.
- `useInternalRouterInstance()` exposes the underlying Space Router instance for rare escape-hatch use.

### Utilities

- `shouldNavigate(event)` returns whether a click should be handled by the router or left to the browser.
- `qs` re-exports Space Router's default query string parser.

### Route data loading

`prepare(ctx)` receives `{ pathname, url, params, query }` and may return `PreparedHandle[]`:

```ts
interface PreparedHandle {
  promise: Promise<unknown>
  release(): void
  priority?: 'route' | 'defer'
  key?: string | number
}
```

The router calls all matched `prepare()` functions during navigation, keeps the returned handles pinned while the route is committed, and calls `release()` when the next route commits or `<Routes>` unmounts.

See the [API Docs](https://humaans.github.io/react-space-router/) and [Migration Guide](./MIGRATION.md) for more details.
