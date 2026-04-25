import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  createRouter,
  type Mode,
  type NavigateTarget,
  type Qs,
  type Route,
  type RouteDefinition,
  type Router as SpaceRouter,
} from 'space-router'

export { qs } from 'space-router'

interface RouterContextValue {
  router: SpaceRouter
  useRoute: () => Route | null
  onNavigating?: (route: Route) => void | Promise<void>
  onNavigated: (route: Route) => void
}

export const RouterContext = createContext<RouterContextValue | undefined>(undefined)
export const CurrRouteContext = createContext<Route | null>(null)

export function useInternalRouterInstance(): SpaceRouter {
  const ctx = useContext(RouterContext)
  if (!ctx?.router) {
    throw new Error('Application must be wrapped in <Router />')
  }
  return ctx.router
}

export function useRoute(): Route | null {
  return useContext(RouterContext)!.useRoute()
}

export function useNavigate() {
  const currRoute = useRoute()
  const navigate = useInternalRouterInstance().navigate
  return useCallback(
    (to: To) => {
      return navigate(to, currRoute as Route | undefined)
    },
    [navigate, currRoute],
  )
}

function defaultUseRoute(): Route | null {
  return useContext(CurrRouteContext)
}

interface RouterOpts {
  mode: Mode | undefined
  qs: Qs | undefined
  sync: boolean | undefined
  disableScrollToTop?: boolean
}

interface InternalRouter {
  router: SpaceRouter & { disableScrollToTop?: boolean }
  routerOpts: RouterOpts
}

function makeRouter(routerOpts: RouterOpts): InternalRouter {
  const router = createRouter({ mode: routerOpts.mode, qs: routerOpts.qs, sync: routerOpts.sync })
  ;(router as InternalRouter['router']).disableScrollToTop = routerOpts.disableScrollToTop
  return { router: router as InternalRouter['router'], routerOpts }
}

export interface RouterProps {
  mode?: Mode
  qs?: Qs
  sync?: boolean
  useRoute?: () => Route | null
  onNavigating?: (route: Route) => void | Promise<void>
  onNavigated?: (route: Route) => void
  children?: ReactNode
}

export function Router({ mode, qs, sync, useRoute, onNavigating, onNavigated, children }: RouterProps) {
  const [{ router, routerOpts }, setRouter] = useState<InternalRouter>(() => makeRouter({ mode, qs, sync }))

  const [currRoute, setCurrRoute] = useState<Route | null>(null)

  const connectedRouter = useMemo<RouterContextValue>(
    () => ({
      router,
      useRoute: useRoute || defaultUseRoute,
      onNavigating,
      onNavigated(route: Route) {
        if (!useRoute) {
          setCurrRoute(route)
        }
        if (onNavigated) onNavigated(route)
      },
    }),
    [router, useRoute, onNavigating, onNavigated],
  )

  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={connectedRouter}>
      <CurrRouteContext.Provider value={currRoute}>{children}</CurrRouteContext.Provider>
    </RouterContext.Provider>
  )
}

export interface RoutesProps {
  routes: RouteDefinition[]
  disableScrollToTop?: boolean
}

export function Routes({ routes, disableScrollToTop }: RoutesProps) {
  const ctx = useContext(RouterContext)!
  const { router, onNavigating, onNavigated } = ctx
  const route = ctx.useRoute()
  const onlyLatest = useOnlyLatest()
  useScrollToTop(route, disableScrollToTop)

  useEffect(() => {
    const transition = (next: Route) => {
      onlyLatest(async (isLatest) => {
        if (isLatest() && onNavigating) {
          await onNavigating(next)
        }
        if (isLatest()) {
          onNavigated(next)
        }
      })
    }
    return router.listen(routes, transition)
  }, [router, routes, onNavigating, onNavigated])

  return useMemo(() => {
    if (!route) {
      return null
    }

    return route.data.reduceRight<ReactNode>((children, segment) => {
      const props = (segment as { props?: Record<string, unknown> }).props ?? {}
      const component = (segment as { component?: unknown }).component
      const Component = resolveComponent(component)
      // segments without a component act as transparent passthroughs so descendants still render
      return Component ? <Component {...props}>{children}</Component> : children
    }, null)
  }, [router, route && route.pathname])
}

function resolveComponent(component: unknown): ComponentType<any> | null {
  if (!component) return null
  const c = component as { default?: ComponentType<any> } & ComponentType<any>
  return c.default || c
}

function useScrollToTop(route: Route | null, disabled?: boolean) {
  const prevScrollGroup = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!route || disabled) {
      return
    }

    const datas = route.data
    const data = datas[datas.length - 1] as { scrollGroup?: string }
    const scrollGroup = data.scrollGroup || route.pathname
    if (prevScrollGroup.current !== scrollGroup) {
      prevScrollGroup.current = scrollGroup
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0)
      }
    }
  }, [route && route.pathname, disabled])
}

export function useMakeHref() {
  const { href } = useInternalRouterInstance()
  return href
}

export type To =
  | string
  | (NavigateTarget & {
      onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
      current?: boolean
    })

export interface LinkPropsResult {
  href: string
  'aria-current': 'page' | undefined
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void
}

export function useLinkProps(to: To): LinkPropsResult {
  const target: NavigateTarget & { onClick?: (e: MouseEvent<HTMLAnchorElement>) => void; current?: boolean } =
    typeof to === 'string' ? { url: to } : to

  const currRoute = useRoute()
  const navigate = useNavigate()
  const makeHref = useMakeHref()

  const href = target.url ? target.url : makeHref(target, currRoute as Route | undefined)
  const isCurrent =
    typeof target.current === 'undefined'
      ? currRoute?.pathname === href.replace(/^#/, '').split('?')[0]
      : target.current

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (target.onClick) target.onClick(event)

    if (shouldNavigate(event)) {
      event.preventDefault()
      navigate(target)
    }
  }

  return {
    href,
    'aria-current': isCurrent ? 'page' : undefined,
    onClick,
  }
}

type FnOr<T> = T | ((isCurrent: boolean) => T)

export interface LinkOwnProps {
  href?: To
  replace?: boolean
  current?: boolean
  className?: FnOr<string | undefined>
  style?: FnOr<CSSProperties | undefined>
  extraProps?: (isCurrent: boolean) => Record<string, unknown>
  children?: ReactNode
}

export type LinkProps = LinkOwnProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkOwnProps | 'onClick'>

export function Link({
  href: to,
  replace,
  current,
  className,
  style,
  extraProps,
  children,
  ...anchorProps
}: LinkProps) {
  const linkTo: To =
    typeof to === 'string'
      ? { url: to, replace, current }
      : { ...(to as NavigateTarget & { onClick?: any; current?: boolean }), replace, current }
  const linkProps = useLinkProps(linkTo)
  const isCurrent = linkProps['aria-current'] === 'page'
  const evaluate = <T,>(valOrFn: FnOr<T>): T => (typeof valOrFn === 'function' ? (valOrFn as any)(isCurrent) : valOrFn)
  return (
    <a
      aria-current={linkProps['aria-current']}
      {...anchorProps}
      className={evaluate(className)}
      style={evaluate(style)}
      {...(extraProps ? extraProps(isCurrent) : {})}
      href={linkProps.href}
      // eslint-disable-next-line react/jsx-handler-names
      onClick={linkProps.onClick}
    >
      {children}
    </a>
  )
}

export interface NavigateProps {
  to: To
}

export function Navigate({ to }: NavigateProps) {
  const [navigated, setNavigated] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!navigated) {
      navigate(to)
      setNavigated(true)
    }
  }, [navigated])

  return null
}

export function shouldNavigate(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0) return false
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return false
  const el = e.currentTarget as Element | null
  if (el && el.tagName === 'A') {
    const a = el as HTMLAnchorElement
    // let the browser handle these: opening in a new tab/window, downloads,
    // and cross-origin or non-http(s) protocols (mailto:, tel:, ...)
    if (a.target && a.target !== '_self') return false
    if (a.hasAttribute('download')) return false
    if (a.origin && a.origin !== window.location.origin) return false
  }
  return true
}

function useOnlyLatest() {
  const seq = useRef(0)

  return (fn: (isLatest: () => boolean) => void) => {
    seq.current += 1
    const curr = seq.current
    const isLatest = () => seq.current === curr
    return fn(isLatest)
  }
}
