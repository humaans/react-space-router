---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

> [Space Router](https://kidkarolis.github.io/space-router/) bindings for React

React Space Router is a set of hooks and components for keeping your app in sync with the url and performing page navigations. A library built by and used at [Humaans](https://humaans.io/).

- React hooks based
- Nested routes
- Async navigation middleware
- Built in query string parser
- Supports external stores for router state
- Scrolls to top after navigation
- Preserves cmd/ctrl/alt/shift click and mouse middle click

## Why

"Perfection is achieved when there is nothing left to take away." React Space Router is built upon Space Router, a framework agnostic tiny core that handles url listening, route matching and navigation. React Space Router wraps that core into an idiomatic set of React components and hooks. The hope is you'll find React Space Router refreshingly simple compared to the existing alternatives, while still offering enough extensibility.

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

The application needs to be wrapped in the Router component to provides the router context and state.

Props:

- `mode` one of `history`, `hash`, `memory`, default is `history`
- `qs` a custom query string parser, an object of shape `{ parse, stringify }
- `useRoute` a custom hook for subscribing to current route state. If this is provided, the router will assume you're storing the latest router state passed to you via `onNavigated` callback and will allow subscribing to this state via this custom hook
- `onNavigating(nextRoute)` called when navigation starts, can be an async function which case the router will await before proceeding to finalise the transition and call `onNavigated`, note if a new navigation is started while this function is processing, `onNavigated` will no longer be called for this specific navigation, instead the next navigation kicks on and repeats the same sequence
- `onNavigated(route)` called when navigation completed

### `<Routes />`

```js
<Routes routes={[{ path: '/', component: Home }]}>
```

Render the components that match the current route based on the route config.

Props:

- `routes` an array of arrays of route definitions, where each route is an object of shape `{ path, component, props, redirect, scrollGroup, routes, ...metadata }`
  - `path` is the URL pattern to match that can include named parameters as segments
  - `component` a react component to render, can be a component wrapped in React.lazy
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

Renders an `<a>` link with a correct `href` and `onClick` handler that will intercept the click and push a history entry to avoid full page reload. Preserves cmd + click behaviour.

Props:

- `href` navigation target, can be a `string` or an `object` with:
  - `pathname` the pathname portion of the target url, which can include named segments
  - `params` params to interpolate into the named pathname segments
  - `query` the query object that will be passed through `qs.stringify`
  - `hash` the hash fragment to append to the url of the url
  - `merge` merge partial `to` object into the current route
- `replace` set to true to replace the current entry in the navigation stack instead of pushing
- `current` set to true to render link as current page, or false to disable auto current page detection based on the current URL
- `className` can be a function that takes `isCurrent` if the current route is active
- `style` can be a function that takes `isCurrent` if the current route is active
- `extraProps` a function that takes `isCurrent` if the current route is active

The rest of the props are spread onto the `<a>` element.

### `<Navigate />`

```js
<Navigate to={{ pathname: '/' }} />
```

Redirect to the target url upon rendering this component.

Props:

- `to` can be a `string` or an `object` (refer to `navigate` below)

### `useInternalRouterInstance`

```js
const router = useInternalRouterInstance()
```

Get the Space Router instance. See [space-router docs](https://kidkarolis.github.io/space-router/) for details. Should typically not be necessary to use it directly. All relevant functionality is available via the other hooks.

### `useRoute`

```js
const route = useRoute()
```

Subscribe to the current route. Route is an object of shape `{ url, pathname, params, query, search, hash, pattern, data }`.

- `url` full relative url string including query string and hash if any
- `pathname` the pathname portion of the target url, which can include named segments
- `params` params extracted from the named pathname segments
- `query` query object that was parsed with `qs.parse`
- `search` full unparsed query string
- `hash` hash fragment
- `pattern` the matched route pattern as defined in the route config
- `data` an array of nested matched route objects with componentns and any additional metadata found in the route config

### `useNavigate`

```js
const navigate = useNavigate()

// examples
navigate('/shows')
navigate({ url: '/show/1' })
navigate({ url: '/show/2', replace: true })
navigate({ pathname: '/shows', query: { 'most-recent': 1 } })
navigate({ query: { 'top-rated': 1 }, merge: true })
navigate({ query: { 'top-rated': undefined }, merge: true })
```

Get the `navigate` function for performing navigations. Navigate takes a `string` url or an `object` of shape:

- `pathname` the pathname portion of the target url, which can include named segments
- `params` params to interpolate into the named pathname segments
- `query` the query object that will be passed through `qs.stringify`
- `hash` the hash fragment to append to the url of the url
- `merge` merge partial `to` object into the current route
- `replace` set to true to replace the current entry in the navigation stack instead of pushing

### `useLinkProps`

```js
const linkProps = useLinkProps(to)
<a {...linkProps} />
```

Get linkProps that you can spread onto your own links to make them render both `href`, but also handle clicks to perform navigations using the router. Link props is an object of shape `{ href, aria-current, onClick}`.

Takes a `string` url or an `object` of shape:

- `pathname` the pathname portion of the target url, which can include named segments
- `params` params to interpolate into the named pathname segments
- `query` the query object that will be passed through `qs.stringify`
- `hash` the hash fragment to append to the url of the url
- `merge` merge partial `to` object into the current route
- `replace` set to true to replace the current entry in the navigation stack instead of pushing
- `current` set to true to render link as current page, or false to disable auto current page detection based on the current URL
- `onClick` a click handler to be called before the navigation takes place

### `useMakeHref`

```js
const makeHref = useMakeHref()
makeHref(to)
```

Create a relative url string to use in `<a href>` attribute.

- `to` object of shape `{ pathname, params, query, hash }`. The `params` will be interpolated into the pathname if the pathname contains any parametrised segments. The `query` is an object that will be passed through `qs.stringify`.

Note: `to` can be a string, in which case `href` simply returns the input. Similarly, `to` can contain `{ url }` key in which case `href` returns that url. This is to align the function signature with that of `navigate` so that two can be used interchangeably.

### `shouldNavigate`

```js
shouldNavigate(e)
```

Check if the current click event should cause a history push, or should be handled by the browser. Used internally by the `<Link />` component when intercepting `click` events to let browser handle:

- cmd/ctrl/alt/shift + click
- middle mouse click
- stop navigation if `e.defaultPrevented` is true
