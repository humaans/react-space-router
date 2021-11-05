---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

> [Space Router](https://kidkarolis.github.io/space-router/) bindings for React

React Space Router is a set of hooks and components for keeping your app in sync with the url and performing page navigations. A library built by and used at [Humaans](https://humaans.io/).

- React hooks based
- Nested routes and async route loading
- Async navigation middleware
- Support for external stores for router state
- Scrolls to top after navigation
- Preserves cmd/ctrl/alt/shift click and mouse middle click

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework agnostic tiny core that handles url listening, route matching and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, with the right level of extensibility.

## Install

```sh
$ npm install react-space-router
```

## Example

```js
import React from 'react'
import { Router, Routes, Link, useRoute, useNavigate } from 'react-space-router'

const routes = [
  { path: '/', component: Home },
  {
    component: SettingsContainer,
    routes: [
      { path: '/settings', component: Settings },
      { path: '/settings/billing', component: Billing },
    ],
  },
]

function App() {
  return (
    <Router>
      <Routes map={routes} />
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

function Settings({ tag }) {
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

```js
<Router />
```

Wrap your application in this component. It provides the router navigation and state.

- `mode` one of `history`, `hash`, `memory`, default is `history`
- `qs` a custom query string parser, an object of shape `{ parse, stringify }
- `useRoute` a custom hook for subscribing to current route state. If this is provided, the router will assume you're storing the latest router state passed to you via `onNavigated` callback and will allow subscribing to this state via this custom hook
- `useNextRoute` a custom hook for subscribing to the next route state. If this is provided, the router will assume you're storing the next router state passed to you via `onNavigating` or `onResolving` callback and will allow subscribing to this state via this custom hook, make sure to return `null` if the navigation completed, that is clear the next route in your store when `onNavigated` is called
- `onNavigating(nextRoute)` called when navigation starts
- `onResolving(nextRoute)` called when async route loading starts
- `onNavigated(route)` called when navigation completed

### `<Routes />`

```js
const routes = [{ path: '/', component: Home }]
<Routes routes={routes}>
```

Takes the route config and renders the components that match the current route.

- `routes` an array of arrays of route definitions, where each route is an object of shape `{ path, component, resolver, props, redirect, scrollGroup, routes, ...metadata }`
  - `path` is the URL pattern to match that can include named parameters as segments
  - `component` a react component to render, can be a component wrapped in React.lazy
  - `resolver` an async function that will return the component, for when you want to load routes async without opting into Suspense, only called once and cached
  - `props` props to be passed to the component
  - `redirect` can be a string or a function that redirects upon entering that route
  - `scrollGroup` a string that can group a set of routes, such that navigating between them does not scroll to top, by default each route is in it's own scroll group
  - `routes` is an array of nested route definitions
  - `...metadata` all other other keys can be chosen by you
- `disableScrollToTop` disable the scroll to top behaviour after each navigation

### `<Link />`

```js
<Link href='/profile/32' className='nav' replace />
```

Renders an `<a>` link with a correct `href` and `onClick` handler that will intercept the click and push a history entry to avoid full page reload. Preserves cmd + click behaviour

- `href` navigation target, can be a string or a `to` object with:
  - `pathname` the pathname portion of the target url, which can include named segments
  - `params` params to interpolate into the named pathname segments
  - `query` the query object that will be passed through `qs.stringify`
  - `hash` the hash fragment to append to the url of the url
  - `merge` merge partial `to` object into the current route
- `replace` set to true to replace the current entry in the navigation stack instead of pushing
- `className` can be a function that takes `isActive` if the current route is active
- `style` can be a function that takes `isActive` if the current route is active
- `extraProps` a function that takes `isActive` if the current route is active

The rest of the props are spread onto the `<a>` element.

### `<Navigate />`

```js
<Navigate to={{ pathname: '/' }} />
```

Redirects to the target url.

- `to` can be a string or an object (refer to Link's `href` prop)

### `useRouter`

```js
const router = useRouter()
```

Returns the Space Router instance. See [space-router docs](https://kidkarolis.github.io/space-router/) for details.

### `useRoute`

```js
const route = useRoute()
```

Returns the current route, which is an object of shape `{ pattern, href, pathname, params, query, search, hash, data }`. Data is an array of all the matched nested routes and includes components and any other metadata you've set in your route config.

### `useNextRoute`

```js
const route = useNextRoute()
```

Returns the next route being navigated to. This normally will be very short lived and is mostly useful in case async routes are being used, so that you can tell that the next route is being loaded. Once the navigation completes, this will return `null`.

### `useNavigate`

```js
const navigate = useNavigate()
```

Returns a function that can be called to perform navigation. Navigate takes one param - `to`, same kind of object used in `<Link href />`. An object of shape `{ url, pathname, params, query, hash, merge, replace }`.

### `useLink`

```js
const linkProps = useLink(href, { replace, onClick })
```

Returns linkProps, an object of shape `{ href, aria-current, onClick}` that you can spread onto your own links. Note if no `href` is passed, then `linkProps` will only return `{ onClick }`.

- `href` refer to `<Link />` href
- `replace` whether clicking this link should replace rather than push a history entry
- `onClick` a click handler to be called before the navigation takes place

### `shouldNavigate`

```js
shouldNavigate(e)
```

Checks if the current click event should cause a history push, or should be handled by the browser. Used internally by the `<Link />` component when intercepting `click` events to let browser handle:

- cmd/ctrl/alt/shift + click
- middle mouse click
- stop navigation if `e.defaultPrevented` is true
