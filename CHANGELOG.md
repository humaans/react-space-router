## 0.7.0

- **Breaking**: move route state inside `<Router>` and remove the old prop-based lifecycle hooks (`useRoute`, `onNavigating`, `onNavigated`). Read the current route with `useRoute()` and observe committed route changes with regular React effects.
- **Breaking**: remove function-form `<Link>` props and `extraProps`. Use `aria-current="page"` for CSS styling, or `useLinkProps()` when active/pending state needs to affect rendered output.
- Add Suspense-aware route transitions backed by React `useTransition`, exposed through `usePending()`.
- Add route `resolver` support for code-split route segments. Resolvers are preloaded during navigation and rendered through `React.lazy`.
- Add route `prepare(ctx)` support for fetch-as-you-render data loading. Returned `PreparedHandle`s are pinned while the route is committed and released on the next commit or `<Routes>` unmount.
- Add `<DelayedSuspense>` and `pendingDelayMs` for delayed skeleton fallbacks during in-flight route navigations.
- Add `transformRoute(route)` for synchronous pre-commit route rewrites, including URL replacement when the transformed route changes `url`.
- Inject matched path params as props onto the route segment that declares each param.
- Add per-link pending state through `useLinkProps(to).isPending`.
- Add `scrollGroup` for keeping scroll position across related routes.
- Preserve normal browser behavior for modified clicks, middle-clicks, downloads, non-self targets, and cross-origin links.

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
