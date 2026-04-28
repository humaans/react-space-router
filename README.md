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
- Optional pre-commit `transformRoute` hook for URL rewrites
- Built in query string parser
- Scrolls to top after navigation
- Preserves cmd/ctrl/alt/shift click and mouse middle click

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework agnostic tiny core that handles url listening, route matching and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility.

## Install

```sh
$ npm install react-space-router
```

## API

See the [API Docs](https://humaans.github.io/react-space-router/) for more details.
