import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { createRouter } from 'space-router'

export { qs } from 'space-router'

const RouterContext = createContext()
const RouterStoreContext = createContext()

export function useRouter() {
  return useContext(RouterContext).router
}

export function useRoute() {
  return useContext(RouterContext).useRoute()
}

export function useNavigate() {
  return useRouter().navigate
}

/**
 * useLink hook can be used instead of Link component
 * for more flexibility or when more convenient
 */
export function useLink(href, { direct, replace, onClick: onLinkClick } = {}) {
  const { pathname } = useRoute()
  const navigate = useNavigate()
  const router = useRouter()

  if (!href) return { onClick: onLinkClick }

  let isCurrent = false
  if (typeof href === 'string' ? pathname === href.split('?')[0] : pathname === href.pathname) {
    isCurrent = true
  }

  function onClick(event) {
    onLinkClick && onLinkClick(event)

    if (shouldNavigate(event)) {
      event.preventDefault()
      if (typeof href === 'string') {
        navigate({ url: href, replace })
      } else {
        navigate({ ...href, replace })
      }
    }
  }

  return {
    href: typeof href === 'string' ? href : router.href(href),
    'aria-current': isCurrent ? 'page' : undefined,
    onClick: direct ? onLinkClick : onClick,
  }
}

function useRouteDefault() {
  return useContext(RouterStoreContext)
}

export function Router({
  mode,
  qs,
  sync,
  // a hook for subscribing to the current route in the external store
  useRoute = useRouteDefault,
  // callback for when navigation starts
  onNavigating,
  // callback for when navigation completed
  onNavigated,
  children,
}) {
  const [currentRoute, setCurrentRoute] = useState()
  const [router, setRouter] = useState(() => {
    const router = createRouter({ mode, qs, sync })
    router._mode = mode
    router._qs = qs
    router._sync = sync
    return router
  })
  const connectedRouter = useMemo(() => {
    return { router, useRoute, onNavigating, onNavigated: onNavigated || setCurrentRoute }
  }, [router, useRoute, onNavigating, onNavigated])

  useEffect(() => {
    if (router._mode !== mode || router._qs !== qs || router._sync !== sync) {
      setRouter(createRouter({ mode, qs, sync }))
    }
  }, [router, mode, qs, sync])

  return (
    <RouterContext.Provider value={connectedRouter}>
      <RouterStoreContext.Provider value={currentRoute}>{children}</RouterStoreContext.Provider>
    </RouterContext.Provider>
  )
}

/**
 * Routes component:
 * - creates the router
 * - adds it to Moonwave context
 * - renders the matching routes
 * - binds the router transitions to atom
 */
export function Routes({ routes }) {
  const { router, onNavigating, onNavigated } = useContext(RouterContext)
  const route = useRoute()
  const prevRoutes = useRef(routes)
  const prevScrollGroup = useRef()
  const seq = useRef(0)

  useEffect(() => {
    if (!router) {
      throw new Error('Wrap your application in <Router />')
    }
  }, [])

  useEffect(() => {
    if (!router) {
      return
    }

    const transition = (route) => {
      // during hot reloading of route config module
      // the reference of the routes changes...
      // special casing swapping of routes, we don't
      // want to dispatch any actions in this case since
      // we've not changed the route, we've only updated
      // the route config. This is relevant for hot reloading.
      const routesSwapped = prevRoutes.current !== routes
      prevRoutes.current = routes

      latest(seq, async (isLatest) => {
        if (route.data.find((r) => !r.component)) {
          !routesSwapped && onNavigating && onNavigating(route)
          await Promise.all(
            route.data.map(async (routeData) => {
              if (!routeData.component && routeData.resolver) {
                routeData.component = await routeData.resolver()
              }
            })
          )
        }
        if (isLatest()) {
          !routesSwapped && onNavigated && onNavigated(route)
        }
      })
    }
    return router.listen(routes, transition)
  }, [router, routes, onNavigating, onNavigated])

  useEffect(() => {
    if (!router || !route) {
      return
    }

    const routeDatas = route.data
    const routeData = routeDatas[routeDatas.length - 1]
    const scrollGroup = routeData.scrollGroup || route.pattern
    if (prevScrollGroup.current === scrollGroup) return
    prevScrollGroup.current = scrollGroup
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0)
    }
  }, [router, route && route.pattern])

  return useMemo(() => {
    if (!router || !route) {
      return null
    }

    return route.data.reduceRight((children, { props = {}, component }) => {
      const Component = component ? component.default || component : null
      return Component ? <Component {...props}>{children}</Component> : null
    }, null)
  }, [router, route])
}

/**
 * Link component
 */
export function Link(props) {
  const { href, direct, replace, activeStyle, activeClassName, children, ...anchorProps } = props
  const linkProps = useLink(href, { direct, replace })
  const isCurrent = linkProps['aria-current'] === 'page'
  const style = isCurrent ? { ...anchorProps.style, ...activeStyle } : anchorProps.style
  const className = isCurrent ? classNames(anchorProps.className, activeClassName) : anchorProps.className
  return (
    <a {...anchorProps} {...linkProps} style={style} className={className}>
      {children}
    </a>
  )
}

export function shouldNavigate(e) {
  return !e.defaultPrevented && e.button === 0 && !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function classNames(...c) {
  return c.filter(Boolean).join(' ')
}

/**
 * A small helper to make sure we can execute
 * async logic in a safe way by checking if
 * we are still the latest async function
 * processing something
 */
function latest(seq, fn) {
  seq.current += 1
  const curr = seq.current
  return fn(() => seq.current === curr)
}

// TODO - reimplement merge in an async safe way
export function merge(curr, to) {
  const pathname = to.pathname || curr.pattern
  const params = Object.assign({}, curr.params, to.params)
  const query = to.query === null ? null : Object.assign({}, curr.query, to.query)
  const hash = to.hash === null ? null : to.hash || curr.hash || ''
  return { pathname, params, query, hash }
}
