## 1.0.0

The router is now built around React's transition machinery: navigations run inside `useTransition`, Suspense keeps the previous route on screen while the destination loads, and the destination's code and data are kicked off as soon as navigation begins. See the [docs](https://humaans.github.io/react-space-router/) for usage guides and [MIGRATION.md](./MIGRATION.md) for a step-by-step migration from 0.6.x.

### Breaking

- Route definitions move from `<Routes routes={routes}>` to `<Router routes={routes}>`; `<Routes />` now marks where the matched route tree renders.
- Route state lives inside `<Router>`; the prop-based lifecycle hooks (`useRoute`, `onNavigating`, `onNavigated`) are removed. Read the current route with `useRoute()`, run post-navigation logic in regular effects, and replace `onNavigating`-based preloading with per-route `resolver` and `prepare`.
- Function-form `<Link>` props (`className`, `style`, `extraProps`) are removed. Style current and pending links in plain CSS via the `aria-current="page"` and `data-pending` attributes, or use `useLinkState(to)` when the state needs to affect rendered output.
- `useInternalRouterInstance` is renamed to `useSpaceRouter`. Same escape hatch, same return value — the underlying space-router instance.
- `PreparedHandle` now requires only the `release()` lease lifecycle that the router consumes; richer data-layer handles remain compatible. The undocumented `RouterContext` export is removed, and `<Link href>` is now required.

### New

- Suspense-aware navigation: the previous route stays on screen and interactive while the destination suspends. Pending state comes for free — `usePending()` for "is a navigation happening", `usePendingRoute()` for "where to", and a per-link `data-pending` attribute (plus `useLinkState(to)`) for "was it this link" — for clicks, programmatic navigation, and browser back/forward alike.
- `usePreviousRoute()` for the route preceding the current successful commit. It is available on a destination's first render and ignores pending, suspended, superseded, and unmatched destinations.
- Code-split routes via `resolver: () => import('./Page')`, preloaded at navigation time and rendered through `React.lazy`.
- Fetch-as-you-render data loading via route `prepare(ctx)` — fetches start when navigation begins (including cold direct loads), in parallel with chunk download, and the returned `PreparedHandle`s stay pinned while the route is committed.
- Declarative data loading via route `queries` + a `<Router data>` adapter: declare a route's data once and the adapter runs it as `prepare` on navigation and `prefetch` on hover. The adapter is a minimal `{ prepare, prefetch }` contract co-designed with (and satisfied directly by) figbird's kit — the router stays data-layer-agnostic. The low-level `prepare`/`prefetch` fields remain for divergent routes or adapter-less data layers.
- Link prefetching: `<Link prefetch>` (`true`/`'hover'`/`'visible'`) warms a route's chunk and data on hover or visibility, `<Router prefetchLinks>` sets the default for all links, route `prefetchable: false` vetoes speculation for expensive routes, and `usePrefetch()` exposes the primitive for custom triggers.
- `<Link>` forwards its anchor ref, composing it with the internal observer ref used by `prefetch='visible'`.
- `<DelayedSuspense>` and `pendingDelayMs` for browser-style loading: hold the previous page briefly, then degrade to a skeleton.
- `transformRoute(route)` pre-commit hook for URL rewrites (e.g. persisted-query restoration), with automatic address-bar sync.
- `transformQuery(query, { to, sourceRoute, targetRoute })` for app-owned destination-query policy across navigation, href, link, `<Navigate>`, and prefetch APIs. Direct loads, browser traversal, external/protocol URLs, and same-page fragments remain untouched.
- Consecutive identical outstanding navigation requests from the same source route are coalesced, preventing duplicate history writes while preserving A → B → A and intentional same-URL navigation after a commit.
- Matched path params are injected as props onto the route segment that declares them.
- `scrollGroup` for keeping scroll position across related routes.
- `<BlockNavigation>` for declarative unsaved-change guards: native confirmation or render-function custom UI, with pre-history app navigation blocking, Navigation API Back/Forward replay where available, and `beforeunload` exit protection.

### Fixed

- Navigation blocking now distinguishes hash-mode route traversal (`#/route`) from ordinary fragments, so Back/Forward guards work in hash-routed applications without taking ownership of `#section` links.
- Rejected route resolvers no longer remain permanently cached; resetting an error boundary can retry transient chunk-load failures, while the documentation explains full-page reload recovery for stale deployments.
- App-created navigation to a cross-page hash fragment now scrolls to the destination element after commit, falling back to the top when it is absent. Back/Forward and same-page hash links remain browser-owned.
- Replacing the route table prepares the current destination exactly once in history/hash mode; memory mode still performs its required explicit rematch.
- Route preparation is transactional: if a later segment throws, every handle already acquired for that attempt is released.
- Initial preparation handles remain leak-free under React 18's discarded StrictMode render while separate Router instances retain independent leases.
- Unmatched URLs now clear `useRoute()` and `<Routes>`, and release the prior route's preparation handles, without advancing `usePreviousRoute()`'s successful-route history.
- Back/Forward traversal now leaves scroll restoration to the browser instead of applying the router's new-page scroll reset after commit.

### Polish

- The documentation now covers error-boundary placement, chunk-load recovery, rejected data reads, and the synchronous non-throwing contract for route preparation.
- CI now exercises the supported peer range against both React 18 and React 19.
- Chromium CI now covers Suspense navigation, interrupted traversal, native scroll restoration, browser-owned same-page hashes, and router-managed cross-page fragments.
- The documentation now defines redirects, the complete path-pattern grammar, and the native ESM/ES2022 browser baseline.

## 0.6.6

- Upgrade all dependencies to address security alerts.

## 0.6.5

- Upgrade all dependencies to address security alerts.

## 0.6.4

- Upgrade all dependencies to address security alerts.

## 0.6.3

- Memo the navigate function returned by useNavigate()

## 0.6.2

- Upgrade all dependencies to address security alerts.

## 0.6.1

- Upgrade all dependencies to address security alerts.

## 0.6.0

- Upgrade all dependencies.
- Switch from babel to swc.

## 0.5.0

- Allow overriding automatic `current` behaviour with an explicit `current` prop

## 0.4.0

- Add `useMakeHref` that returns `makeHref` function for creating hrefs
- **Breaking**: rename `useLink` to `useLinkProps`
- **Breaking**: rename `useRouter` to `useInternalRouterInstance` to discourage use of it

## 0.3.0

- Upgrade to the latest `space-router` which allows `navigate` to take a `string` url
- Align `useLink` API with the rest of the router, it takes a `string` or an `object` now, which is the same as how `navigate` works

## 0.2.0

- Remove async route `resolver` feature and `useNextRoute` - can be implemented in userland. Previously, `useNextRoute` was used in `<Navigate />` to know if the router is in the process of navigating, but now we use local state for that. This allowed removing `useNextRoute`, and so `resolver` can now be more easily implemented in userland via `onNavigating`, which can block and allows processing matched routes in any way, such as awaiting on `data.component = await data.resolver()`. All in all, removing API surface is great, less is more, and async route resolving is getting superseded by Suspense anyway.
- Fix the webpack bundling issues caused by `setImmediate` usage in `space-router`.
- Fix `onNavigated` callback, which wasn't getting called correctly previously.

## 0.1.0

Ladies and gentlemen we are floating in space
