<p align="center">
  <img width="360" src="https://user-images.githubusercontent.com/324440/140424786-813d7ace-6ec6-45ad-af6e-9318180786c5.png" alt="react space router logo, a skeleton floating in space with a react logo for the head" title="react-space-router">
</p>

<h1 align="center">React Space Router</h1>
<h4 align="center"><a href="https://github.com/KidkArolis/space-router">Space Router</a> bindings for React</a></h4>
<br />

React Space Router is a set of hooks and components for keeping your app in sync with the URL and performing page navigations. Suspense-native and built around React's transition machinery. A library built by and used at [Humaans](https://humaans.io/).

- Suspense-native navigation that keeps the previous route visible while the next one loads.
- Nested, code-split routes with path params passed straight to route components.
- Route-level data loading and prefetching through a small, data-layer-agnostic adapter.
- Link prefetching on hover, focus, touch, or visibility.
- Pending route state for global indicators, sidebars, tabs, and breadcrumbs.
- Delayed loading fallbacks for fast-feeling browser-style transitions.

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework agnostic tiny core that handles URL listening, route matching and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility for modern Suspense-driven UIs.

## Scope

RSP is a client-side React router for production SPAs. SSR is intentionally out of scope.

If you need SSR, use a framework/router designed around request-time rendering. RSP optimizes for rich authenticated apps where client routing, Suspense-aware navigation, and data cache lifecycles matter more than first-request HTML.

## Install

```sh
$ npm install react-space-router
```

## Compatibility

The peer dependency is React 18 or newer, with React 18 and React 19 exercised in CI.

The package is published as native ESM targeting ECMAScript 2022. It is intended for modern evergreen browsers and does not include downlevel transforms or polyfills. Applications targeting older JavaScript engines must transpile the package as part of their build and provide any required platform polyfills. Visibility prefetching requires `IntersectionObserver`; when it is unavailable, `prefetch='visible'` safely does nothing.

## Docs

See the [API Docs](https://humaans.github.io/react-space-router/) for examples, component and hook references, loading UI guidance, prefetching, and route data loading details.

See the [Migration Guide](./MIGRATION.md) for upgrade notes.
