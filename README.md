<p align="center">
  <img width="360" src="https://user-images.githubusercontent.com/324440/140424786-813d7ace-6ec6-45ad-af6e-9318180786c5.png" alt="react space router logo, a skeleton floating in space with a react logo for the head" title="react-space-router">
</p>

<h1 align="center">React Space Router</h1>
<br />

React Space Router is a minimal, Suspense-first router for React. It uses React’s own transition model to load routes and data, keeping navigation fluid and the API refreshingly simple. Built and used at [Humaans](https://humaans.io/) and [Athena](https://withathena.ai/).

- Control loading UI with Suspense boundaries: show destination skeletons, delay fallbacks for quick loads, or keep the current page visible until the next route is ready.
- Show immediate navigation feedback with pending state, from a spinner on the action to destination-aware tabs, sidebars, and breadcrumbs.
- Nest and lazy-load routes, with path parameters passed directly to route components.
- Declare route data once, then prepare or prefetch it through an adapter that works with any data layer.
- Prefetch route code and data on hover, focus, touch, or visibility.
- Use previous route state to build contextual back links.
- Block navigation with a browser prompt or your own confirmation UI.

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework agnostic tiny core that handles URL listening, route matching and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility for modern Suspense-driven UIs.

## Scope

RSP is a client-side React router for production SPAs. SSR is intentionally out of scope.

If you need SSR, use a framework/router designed around request-time rendering. RSP optimizes for rich authenticated apps where client routing, Suspense-aware navigation, and data cache lifecycles matter more than first-request HTML.

## Install

```sh
$ npm install react-space-router
```

## Docs

See the [API Docs](https://humaans.github.io/react-space-router/) for examples, component and hook references, loading UI guidance, prefetching, and route data loading details.

Try the [live demo](https://humaans.github.io/react-space-router/demo/) to compare Suspense loading modes and navigation blocking interactively.

See the [Migration Guide](./MIGRATION.md) for upgrade notes.
