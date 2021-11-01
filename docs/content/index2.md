---
title: 'React Space Router'
draft: false
toc: true
---

# React Space Router

A router for [React](https://reactjs.org/) apps. Powered by [space-router](https://github.com/KidkArolis/space-router).

Built by the team at [Humaans](https://humaans.io/).

* Nested routes
* Idiomatic react hooks
* Lazy route loading
* Allows storing router state in an external store
* Weighs XKb

## Why

The idea behind React Space Router is simple - what is the minimum set of features you need to have a router that is useful for building most real world apps. "Perfection is achieved when there is nothing left to take away."

React Space Router is built upon Space Router, a framework agnostic tiny core that handles url listening, route matching and navigation, where React Space Router wraps that core into an idiomatic set of React components and hooks.

The hope here is for you to find this router super simple to use compared to the existing alternatives, all while not missing any capabilities that you couldn't purpose build in your own app.

## Install

```sh
$ npm install react-space-router
```

## Example

```jsx
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

// ...
```

## Components

### `Router`

```js
<Router />
```

**Arguments**

- `serviceName` - the name of Feathers service
- `id` - the id of the resource
- `params` - any params you'd pass to a Feathers service call, plus any Figbird params

**Figbird params**

- `skip` - setting to true will not fetch the data
- `realtime` - one of `merge` (default), `refetch` or `disabled`
- `fetchPolicy` - one of `swr` (default), `cache-first` or `network-only`

**Returns**

- `data` - starts of as `null` and is set to the fetch result, usually an object
- `status` - one of `loading`, `success` or `error`
- `isFetching` - true if fetching data for the first time or in the background
- `error` - error object if request failed
- `refetch` - function to refetch data

### `Routes`

```js
<Routes />
```

**Arguments**

- `serviceName` - the name of Feathers service
- `params` - any params you'd pass to Feathers, plus any Figbird params

**Figbird params**

- `skip` - setting true will not fetch the data
- `realtime` - one of `merge` (default), `refetch` or `disabled`
- `fetchPolicy` - one of `swr` (default), `cache-first` or `network-only`
- `allPages` - fetch all pages
- `matcher` - custom matcher function of signature `(defaultMatcher) => (query) => (item): bool`, used when merging realtime events into local query cache

**Returns**

- `data` - starts of as `null` and is set to the fetch result, usually an array
- `status` - one of `loading`, `success` or `error`
- `isFetching` - true if fetching data for the first time or in the background
- `error` - error object if request failed
- `refetch` - function to refetch data

The return object also has the rest of the Feathers response mixed, typically:

- `total` - total number of records
- `limit` - max number of items per page
- `skip` - number of skipped items (offset)

<!-- useRouter
useRoute
useRouteData
useNavigate
useLink
Router
Routes
Link
shouldNavigate -->

### `Link`

```js
<Routes />
```

## Hooks

### `useRouter`

```js
const router = useRouter()
```

**Returns**

A router instance. See [space-router docs](https://github.com/KidkArolis/space-router) for reference.

### `useRoute`

```js
const { pathname, params, query, search, hash, pattern } = useRoute()
```

**Returns**

- `pathname` - a string containing an initial '/' followed by the path of the URL, not including the query string or fragment.
- `params` - 
- `query` - 
- `search` - 
- `hash` - 
- `pattern` - 

### `Provider`

```js
<Provider feathers={feathers}>{children}</Provider>
```

- `feathers` - feathers instance
- `idField` - string or function, defaults to `item => item.id || item._id`
- `updatedAtField` - string or function, defaults to `item => item.updatedAt || item.updated_at`, used to avoid overwriting newer data in cache with older data when `get` or realtime `patched` requests are racing
- `atom` - custom atom instance
- `AtomContext` - custom atom context

## Advanced usage

### Lazy routes

If you want to have a looke at the cache contents for debugging reasons, you can do so as shown above. Note: this is not part of the public API and could change in the future.

```js
function App() {
  const { atom } = useFigbird()

  useEffect(() => {
    // attach the store to window for debugging
    window.atom = atom

    // log the contents of the cache
    console.log(atom.get())

    // listen to changes to the cache
    atom.observe(() => {
      console.log(atom.get())
    })
  }, [atom])
}
```

### Data prefetching

...

### Binding links and buttons

In principle, you could use Figbird with any REST API as long as several conventions are followed or are mapped to. Feathers is a collection of patterns as much as it is a library. In fact, Figbird does not have any code dependencies on Feathers. It's only the Feathers patterns and conventions that the library is designed for. In short, those conventions are:

1. Structure your API around resources
2. Where the resources support operations: `find`, `get`, `create`, `update`, `patch`, `remove`
3. The server should emit a websocket event after each operation (see [Service Events](https://docs.feathersjs.com/api/events.html#service-events))

For example, if you have a `comments` resource in your application, you would have some or all of the following endpoints:

- `GET /comments`
- `GET /comments/:id`
- `POST /comments`
- `PUT /comments/:id`
- `PATCH /comments/:id`
- `DELETE /comments/id`

The result of the `find` operation or `GET /comments` would be an object of shape `{ data, total, limit, skip }` (Note: the pagination envolope will be customizable in Figbird in the future, but it's current fixed to this format).

### Using external store

Figbird is using [tiny-atom](https://github.com/KidkArolis/tiny-atom) for it's cache. This allows for a succint implementation and efficient bindings from cached data to components. It is possible to pass in a custom instance of tiny-atom to `figbird` if you're already using tiny-atom in your app. This would allow for easier inspection and debugging of your application's state and behaviour. For example, here is the `tiny-atom` logger output:

![Figbird Logger](https://user-images.githubusercontent.com/324440/64800653-d94fec00-d57e-11e9-8b35-5a943a22ebe1.png)

#### Pass atom via prop

```js
import React, { useState } from 'react'
import { createAtom } from 'tiny-atom'
import { Provider } from 'figbird'
import createFeathersClient from '@feathersjs/feathers'

export function App() {
  const [feathers] = useState(() => createFeathersClient())
  const [atom] = useState(() => createAtom())
  return (
    <Provider feathers={feathers} atom={atom}>
      {children}
    </Provider>
  )
}
```

#### Pass atom via context

```js
import React, { useState } from 'react'
import { AtomContext } from 'tiny-atom'
import { Provider } from 'figbird'
import createFeathersClient from '@feathersjs/feathers'

export function App() {
  const [feathers] = useState(() => createFeathersClient())
  return (
    <Provider feathers={feathers} AtomContext={AtomContext}>
      {children}
    </Provider>
  )
}
```
