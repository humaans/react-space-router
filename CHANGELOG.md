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
