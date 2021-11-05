import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { createRouter } from 'space-router'

export { qs } from 'space-router'

const RouterContext = createContext()
const CurrRouteContext = createContext()
const NextRouteContext = createContext()

/**
 * Hook for getting the space router instance
 */
export function useRouter() {
  const router = useContext(RouterContext).router

  if (!router) {
    throw new Error('Application must be wrapped in <Router />')
  }

  return router
}

/**
 * Hook for getting the currently active route
 */
export function useRoute(...args) {
  return useContext(RouterContext).useRoute(...args)
}

/**
 * Hook for getting the route being navigated to
 */
export function useNextRoute(...args) {
  return useContext(RouterContext).useNextRoute(...args)
}

/**
 * A hook for navigating around the app
 */
export function useNavigate() {
  const route = useRoute()
  const navigate = useRouter().navigate
  return withMerge(navigate, route)
}

/**
 * Since React Space Router allows async route loading/processing, we make sure that the
 * currently active route that's displayed on the screen gets used instead of the next
 * route that will be rendered, when merge: true is used to compute hrefs
 *
 * Note: with Suspense this will not work the same, as we will trigger onNavigated right away,
 * so I'm not sure how to handle the state in that case, not sure how to access the pre-suspension
 * state, but this will work correctly for now if onNavigating is async and blocking
 */
function withMerge(navigate, route) {
  return (to) => {
    // we replace merge true, with the current route,
    // so that the router.href() inside navigation
    // correctly merges the right current route
    if (to.merge === true) {
      to = { ...to, merge: route }
    }
    return navigate(to)
  }
}

/**
 * When router state is not stored in an external store
 * by default, we read the current route from the CurrRouteContext
 */
function defaultUseRoute() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useContext(CurrRouteContext)
}

/**
 * When router state is not stored in an external store
 * by default, we read the next route from the NextRouteContext
 */
function defaultUseNextRoute() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useContext(NextRouteContext)
}

function makeRouter(routerOpts) {
  const router = createRouter(routerOpts)
  router.disableScrollToTop = routerOpts.disableScrollToTop
  return { router, routerOpts }
}

/**
 * The application must be wrapped in a Router component,
 * this is what provides all of the required context for accessing
 * the navigation function and the router state
 */
export function Router({
  // history | hash | memory
  mode,
  // custom query string parser/stringifier
  qs,
  // setting sync to true will rerender synchronously
  sync,
  // a hook for subscribing to the current route in the external store
  useRoute,
  // a hook for subscribing to the next route in the external store
  useNextRoute,
  // callback for when navigation starts, by default, noop
  onNavigating,
  // callback for when async route loadig starts
  onResolving,
  // callback for when navigation completed
  onNavigated,
  children,
}) {
  // we create the space router instance on the initial mount
  // and we'll recreate it later only if some of the props changed
  const [{ router, routerOpts }, setRouter] = useState(() => {
    return makeRouter({ mode, qs, sync })
  })

  // store current and next routes in the state
  const [currRoute, setCurrRoute] = useState(null)
  const [nextRoute, setNextRoute] = useState(null)

  // create a "connected" router, this is what allows us
  // to externalise the state in case useRoute/useNextRoute
  // are provided, we put this wrapped (or "connected") router
  //
  const connectedRouter = useMemo(
    () => ({
      router,
      useRoute: useRoute || defaultUseRoute,
      useNextRoute: useNextRoute || defaultUseNextRoute,
      onNavigating,
      onResolving() {
        if (!useNextRoute) {
          setNextRoute(nextRoute)
        }
      },
      onNavigated(currRoute) {
        if (!useRoute) {
          setCurrRoute(currRoute)
        }
        if (!useNextRoute) {
          setNextRoute(null)
        }
      },
    }),
    [router, useRoute, useNextRoute, onNavigating, onResolving, onNavigated]
  )

  // recreate the router if any of it's options are changed
  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={connectedRouter}>
      <CurrRouteContext.Provider value={currRoute}>
        <NextRouteContext.Provider value={nextRoute}>{children}</NextRouteContext.Provider>
      </CurrRouteContext.Provider>
    </RouterContext.Provider>
  )
}

/**
 * Routes component subscribes to the route changes
 * and renders the route's components in a nested way
 */
export function Routes({
  // route config
  routes,
  // disable scroll to top behaviour after navigations
  disableScrollToTop,
}) {
  const { router, onNavigating, onResolving, onNavigated } = useContext(RouterContext)
  const route = useRoute()
  const onlyLatest = useOnlyLatest()
  useScrollToTop(route, disableScrollToTop)

  useEffect(() => {
    const transition = (route) => {
      onlyLatest(async (isLatest) => {
        if (onNavigating) {
          onNavigating && onNavigating(route)
        }

        if (isLatest()) {
          if (route.data.find((r) => !r.component)) {
            onResolving && onResolving(route)
            await Promise.all(
              route.data.map(async (routeData) => {
                if (!routeData.component && routeData.resolver) {
                  routeData.component = await routeData.resolver()
                }
              })
            )
          }
        }

        if (isLatest()) {
          onNavigated && onNavigated(route)
        }
      })
    }
    return router.listen(routes, transition)
  }, [router, routes, onNavigating, onResolving, onNavigated])

  return useMemo(() => {
    if (!route) {
      return null
    }

    return route.data.reduceRight((children, { props = {}, component }) => {
      const Component = component ? component.default || component : null
      return Component ? <Component {...props}>{children}</Component> : null
    }, null)
  }, [router, route && route.pathname])
}

/**
 * We use this to scroll to top after each navigation,
 * while taking into account any custom scrollGroups as
 * configured as part of the route data
 */
function useScrollToTop(route, disabled) {
  const prevScrollGroup = useRef()

  useEffect(() => {
    if (!route || disabled) {
      return
    }

    const datas = route.data
    const data = datas[datas.length - 1]
    const scrollGroup = data.scrollGroup || route.pathname
    if (prevScrollGroup.current !== scrollGroup) {
      prevScrollGroup.current = scrollGroup
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0)
      }
    }
  }, [route && route.pathname, disabled])
}

/**
 * useLink hook can be used instead of Link component
 * for more flexibility or when more convenient
 */
export function useLink(to, { replace, onClick: onLinkClick } = {}) {
  const route = useRoute()
  const navigate = useNavigate()
  const router = useRouter()

  if (!to) {
    return { onClick: onLinkClick }
  }

  // normalize a string to into an object to
  to = typeof to === 'string' ? { url: to, replace } : { ...to, replace }

  // replace merge true with the current route, so that the router.href()
  // correctly computes the merged route based on the correct current route
  // this is relevant when we transition into async routes
  if (to.merge === true) to.merge = route

  // to compute if route is active, we resolve the full url
  const href = to.url ? to.url : router.href(to)
  const isActive = route.pathname === href.replace(/^#/, '').split('?')[0]

  function onClick(event) {
    onLinkClick && onLinkClick(event)

    if (shouldNavigate(event)) {
      event.preventDefault()
      if (typeof to === 'string') {
        navigate({ url: to })
      } else {
        navigate({ ...to })
      }
    }
  }

  return {
    href,
    'aria-current': isActive ? 'page' : undefined,
    onClick: onClick,
  }
}

/**
 * Link component
 */
export function Link({ href: to, replace, className, style, extraProps, children, ...anchorProps }) {
  const linkProps = useLink(to, { replace })
  const isActive = linkProps['aria-current'] === 'page'
  const evaluate = (valOrFn) => (typeof valOrFn === 'function' ? valOrFn(isActive) : valOrFn)
  return (
    <a
      aria-current={linkProps['aria-current']}
      {...anchorProps}
      className={evaluate(className)}
      style={evaluate(style)}
      {...(extraProps ? extraProps(isActive) : {})}
      href={linkProps.href}
      // eslint-disable-next-line react/jsx-handler-names
      onClick={linkProps.onClick}
    >
      {children}
    </a>
  )
}

/**
 * Navigate component is used to declaratively redirect
 */
export function Navigate({ to }) {
  const navigate = useNavigate()
  const nextRoute = useNextRoute()
  const isNavigating = !!nextRoute

  useEffect(() => {
    if (!isNavigating) {
      navigate(to)
    }
  }, [isNavigating])

  return null
}

/**
 * Check if this link click event should be navigated using the router,
 * or if we should yield to the default browser navigation behaviour
 */
export function shouldNavigate(e) {
  return !e.defaultPrevented && e.button === 0 && !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

/**
 * A helper hook for safely executing async logic where isLatest()
 * can be called to check if the function is still the latest one
 * being executed
 */
function useOnlyLatest() {
  const seq = useRef(0)

  return (fn) => {
    seq.current += 1
    const curr = seq.current
    const isLatest = () => seq.current === curr
    return fn(isLatest)
  }
}
