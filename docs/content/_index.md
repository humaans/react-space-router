---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

> [Space router](https://github.com/KidkArolis/space-router) bindings for React

React Space Router is a set of hooks and components for keeping your app in sync with the url and performing page navigations.

Built by [Humaans](https://humaans.io/).

## Why

The idea behind React Space Router is simple - what is the minimum set of features you need to have a router that is useful for building most real world apps. "Perfection is achieved when there is nothing left to take away."

React Space Router is built upon Space Router, a framework agnostic tiny core that handles url listening, route matching and navigation, where React Space Router wraps that core into an idiomatic set of React components and hooks.

The hope here is for you to find this router super simple to use compared to the existing alternatives, all while not missing any capabilities that you couldn't purpose build in your own app.

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
  { component: SettingsContainer, children: [
    { path: '/settings', component: Settings }
    { path: '/settings/billing', component: Billing }
  ] }
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
      <Link url="/settings">Settings</Link>
    </div>
  )
}

function Settings({ tag }) {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/settings/billing')
  }, [])

  return (
    <div>
      <h1>Settings</h1>
      <Link url="/">Home</Link>
    </div>
  )
}
```

## API

### `createRouter`

```js
const router = createRouter(options)
```

Creates the router object.

- `options` object
  - `mode` - one of `history`, `hash`, `memory`, default is `history`
  - `qs` - a custom query string parser, an object of shape `{ parse, stringify }`

### `listen`

```js
const dispose = router.listen(routes, onChange)
```

Starts listening to url changes. Every time the url changes via back/forward button or by performing programmatic navigations, the `onChange` callback will get called with the matched `route` object.

Note, calling listen will immediately call `onChange` based on the current URL when in `history` or `hash` modes. This does not happen in `memory` mode so that you could perform the initial navigation yourself since there is no URL to read from in that case.

- `routes` an array of arrays of route definitions, where each route is an object of shape `{ path, redirect, routes, ...metadata }`
  - `path` is the URL pattern to match that can include named parameters as segments
  - `redirect` can be a string or a function that redirects upon entering that route
  - `routes` is a nested object of nested route definitions
  - `...metadata` all other other keys can be chosen by you
- `onChange` is called with `(route)`
  - `route` is an object of shape `{ pattern, href, pathname, params, query, search, hash }`
  - `data` is an array of datas associated with this route

Listen returns a `dispose` function that stops listening to url changes.

### `navigate`

```js
router.navigate(to)
```

Navigates to a URL described.

- `to` - navigation target
  - `url` a relative url string or a route pattern
  - `pathname` the pathname portion of the target url, which can include named segments
  - `params` params to interpolate into the named pathname segments
  - `query` the query object that will be passed through `qs.stringify`
  - `hash` the hash fragment to append to the url of the url
  - `replace` set to true to replace the current entry in the navigation stack instead of pushing

Note, if `url` option is provided, the `pathname`, `params`, `query` and `hash` will be ignored.

### `match`

```js
const route = router.match(url)
```

Match the url against the routes and return the matching route object. Useful in server side rendering to translate the request URL to a matching route.

### `href`

```js
const url = router.href(to)
```

Create a relative URL string to use in `<a href>` attribute.

- `to` object of shape `{ pathname, params, query, hash }`. The `params` will be interpolated into the pathname if the pathname contains any parametrised segments. The `query` is an object that will be passed through `qs.stringify`.

### `getUrl`

```js
const url = router.getUrl()
```

Get the current URL string. Note, this only includes the path and does not not include the protocol and host.

You shouldn't need to read this most of the time since the updates to URL changes and the matching route will be provided in the `listen` callback. Be especially careful if you're performing asynchronous logic in your callback, such as lazily importing some modules, where you're then constructing links based on the current url - use route provided to your listener instead of calling `getUrl` as the URL might already have been updated to another value in the meantime.
