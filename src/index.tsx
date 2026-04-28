import {
  createContext,
  lazy as reactLazy,
  Suspense,
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useTransition,
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

// ---------------------------------------------------------------------------
// Route preparation
// ---------------------------------------------------------------------------

export interface RoutePrepareContext {
  pathname: string
  url: string
  params: Record<string, string | number>
  query: Record<string, unknown>
}

/**
 * Lifecycle handle returned by data-layer `prepare()` calls (e.g. `figbird.prepare`).
 * The router pins the underlying cache entries via `release()` for the lifetime of
 * the navigation; superseded navigations release their handles immediately.
 */
export interface PreparedHandle {
  promise: Promise<unknown>
  release(): void
  priority?: 'route' | 'defer'
  key?: string | number
}

export type RoutePrepare = (ctx: RoutePrepareContext) => readonly PreparedHandle[] | PreparedHandle[] | void

export type ResolverModule = { default: ComponentType<any> }

export type RouteResolver = () => Promise<ResolverModule>

export interface RouteNavigationOptions {
  /**
   * `'immediate'` (default): commit the new route synchronously inside a React
   * transition; let any unresolved route-priority data suspend at the
   * destination's `<Suspense>` boundary.
   *
   * `'ready'` is reserved for a follow-up release.
   */
  commit?: 'immediate'
}

export interface RouteData {
  path?: string
  component?: ComponentType<any> | { default: ComponentType<any> }
  resolver?: RouteResolver
  prepare?: RoutePrepare
  navigation?: RouteNavigationOptions
  scrollGroup?: string
  routes?: RouteData[]
  [extra: string]: unknown
}

export function defineRoute<T extends RouteData>(route: T): T {
  return route
}

export function defineRoutes<T extends readonly RouteData[]>(routes: T): T {
  return routes
}

const resolverPromiseCache = new WeakMap<RouteResolver, Promise<ResolverModule>>()
const resolverComponentCache = new WeakMap<RouteResolver, ComponentType<any>>()

function preloadResolver(resolver: RouteResolver): Promise<ResolverModule> {
  let promise = resolverPromiseCache.get(resolver)
  if (!promise) {
    promise = resolver()
    resolverPromiseCache.set(resolver, promise)
  }
  return promise
}

function getResolverComponent(resolver: RouteResolver): ComponentType<any> {
  let component = resolverComponentCache.get(resolver)
  if (!component) {
    component = reactLazy(() => preloadResolver(resolver))
    resolverComponentCache.set(resolver, component)
  }
  return component
}

function buildPrepareContext(route: Route): RoutePrepareContext {
  const r = route as Route & {
    pathname?: string
    params?: Record<string, string | number>
    query?: Record<string, unknown>
  }
  return {
    pathname: r.pathname ?? '',
    url: r.pathname ?? '',
    params: r.params ?? {},
    query: r.query ?? {},
  }
}

// ---------------------------------------------------------------------------
// Router context
// ---------------------------------------------------------------------------

interface RouterContextValue {
  router: SpaceRouter
  route: Route | null
  commit: (route: Route) => void
  isPending: boolean
}

export const RouterContext = createContext<RouterContextValue | undefined>(undefined)

// Internal context for `<DelayedSuspense>`. Set by `<Router>` based on
// `usePending()` + a configurable threshold. `holding` is true only during
// the pre-commit window where we want the previous route to stay on screen.
const DelayedSuspenseContext = createContext<boolean>(false)

function useRouterCtx(): RouterContextValue {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error('Application must be wrapped in <Router />')
  }
  return ctx
}

export function useInternalRouterInstance(): SpaceRouter {
  return useRouterCtx().router
}

export function useRoute(): Route | null {
  return useRouterCtx().route
}

/**
 * `true` while the router is between navigation start and commit. Backed by
 * React's `useTransition` — flips on as soon as `navigate()` runs and flips off
 * once the destination has committed (and any Suspense fallbacks at the new
 * route have resolved enough to let React's transition settle).
 *
 * Use this for top-of-page progress bars, desaturated link states, and "your
 * click did something" affordances. Don't use it for skeletons — those belong
 * in destination Suspense boundaries.
 */
export function usePending(): boolean {
  return useRouterCtx().isPending
}

export function useNavigate() {
  const { router, route } = useRouterCtx()
  return useCallback(
    (to: To) => {
      return router.navigate(to, route as Route | undefined)
    },
    [router, route],
  )
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

interface RouterOpts {
  mode: Mode | undefined
  qs: Qs | undefined
  sync: boolean | undefined
}

interface InternalRouter {
  router: SpaceRouter
  routerOpts: RouterOpts
}

function makeRouter(routerOpts: RouterOpts): InternalRouter {
  const router = createRouter({ mode: routerOpts.mode, qs: routerOpts.qs, sync: routerOpts.sync })
  return { router, routerOpts }
}

/**
 * Optional pre-commit transform. Runs synchronously between match and commit.
 * Return a modified route to change what gets committed (e.g. to merge a
 * persisted query). If the returned route's `url` differs from the matched
 * route's, the browser URL is synced via `history.replaceState` so the address
 * bar matches what the app is rendering.
 *
 * Must be pure and synchronous.
 */
export type TransformRoute = (route: Route) => Route | void

export interface RouterProps {
  mode?: Mode
  qs?: Qs
  sync?: boolean
  transformRoute?: TransformRoute
  /**
   * How long to hold the previous route on screen before `<DelayedSuspense>`
   * boundaries fall back to their fallback content. Default is `1000` ms.
   * No effect on plain `<Suspense>` boundaries — those always show their
   * fallback the moment the boundary mounts.
   */
  pendingDelayMs?: number
  children?: ReactNode
}

const DEFAULT_PENDING_DELAY_MS = 1000

export function Router({
  mode,
  qs,
  sync,
  transformRoute,
  pendingDelayMs = DEFAULT_PENDING_DELAY_MS,
  children,
}: RouterProps) {
  const [{ router, routerOpts }, setRouter] = useState<InternalRouter>(() => makeRouter({ mode, qs, sync }))

  const [currRoute, setCurrRoute] = useState<Route | null>(null)
  const [isPending, startRouterTransition] = useTransition()

  // `holding` is true during the pre-commit window where `<DelayedSuspense>`
  // boundaries should re-throw their fallback (so the previous route stays
  // committed). It flips off either after `pendingDelayMs` elapses while
  // still pending, or when the transition settles — whichever comes first.
  const [holding, setHolding] = useState(false)
  useEffect(() => {
    if (!isPending) {
      setHolding(false)
      return
    }
    setHolding(true)
    const t = setTimeout(() => setHolding(false), pendingDelayMs)
    return () => clearTimeout(t)
  }, [isPending, pendingDelayMs])

  // Keep the latest transform in a ref so commit() can stay referentially
  // stable while always using the freshest function.
  const transformRef = useRef(transformRoute)
  transformRef.current = transformRoute

  const commit = useCallback((next: Route) => {
    const transform = transformRef.current
    const transformed = transform ? (transform(next) ?? next) : next

    startRouterTransition(() => {
      setCurrRoute(transformed)
    })

    // Sync the address bar if the transform rewrote the URL. We use
    // history.replaceState directly so we don't re-trigger the router's
    // listener loop.
    const matchedUrl = (next as Route & { url?: string }).url
    const transformedUrl = (transformed as Route & { url?: string }).url
    if (
      transformed !== next &&
      transformedUrl &&
      transformedUrl !== matchedUrl &&
      typeof window !== 'undefined' &&
      window.history
    ) {
      window.history.replaceState({}, '', transformedUrl)
    }
  }, [])

  const ctx = useMemo<RouterContextValue>(
    () => ({ router, route: currRoute, commit, isPending }),
    [router, currRoute, commit, isPending],
  )

  useEffect(() => {
    if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
      setRouter(makeRouter({ mode, qs, sync }))
    }
  }, [routerOpts, mode, qs, sync])

  return (
    <RouterContext.Provider value={ctx}>
      <DelayedSuspenseContext.Provider value={holding}>{children}</DelayedSuspenseContext.Provider>
    </RouterContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// DelayedSuspense
// ---------------------------------------------------------------------------

/**
 * A `<Suspense>` boundary whose fallback is *delayed* during an in-flight
 * router navigation: until the router has been pending for `pendingDelayMs`
 * (configured on `<Router>`, default 1000ms), the fallback re-throws so
 * suspension propagates upward — typically to the router-level transition,
 * which keeps the previous route on screen. Past the threshold (or when
 * the transition has already committed and a read is still pending), the
 * fallback renders normally.
 *
 * Use this when you want "stay on the previous page for a moment, then if
 * it's still loading degrade to a skeleton" — the classic browser-style
 * UX for variable-latency data. Outside an in-flight nav, behaves
 * identically to plain `<Suspense>`.
 */
export interface DelayedSuspenseProps {
  fallback: ReactNode
  children?: ReactNode
}

export function DelayedSuspense({ fallback, children }: DelayedSuspenseProps) {
  const holding = useContext(DelayedSuspenseContext)
  return <Suspense fallback={holding ? <DelayedSuspenseHold /> : fallback}>{children}</Suspense>
}

const NEVER_RESOLVES: Promise<never> = new Promise(() => {})

/**
 * Throws a never-resolving promise so the surrounding Suspense boundary's
 * fallback path itself suspends — the suspension bubbles up to the next
 * Suspense boundary above, which during a router transition is the
 * already-committed root holding the previous route.
 */
function DelayedSuspenseHold(): null {
  throw NEVER_RESOLVES
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface RoutesProps {
  routes: RouteDefinition[]
  disableScrollToTop?: boolean
}

export function Routes({ routes, disableScrollToTop }: RoutesProps) {
  const { router, route, commit } = useRouterCtx()
  useScrollToTop(route, disableScrollToTop)

  // Pinned prepare handles for the currently committed navigation. Released
  // when a new navigation commits or when <Routes> unmounts.
  const pinnedHandles = useRef<PreparedHandle[]>([])
  const releasePinned = useCallback(() => {
    const handles = pinnedHandles.current
    pinnedHandles.current = []
    for (const handle of handles) {
      try {
        handle.release()
      } catch {
        // best-effort
      }
    }
  }, [])

  useEffect(() => {
    const transition = (next: Route) => {
      const segments = (next.data ?? []) as RouteData[]
      const ctx = buildPrepareContext(next)
      const nextHandles: PreparedHandle[] = []

      for (const segment of segments) {
        if (segment.resolver) preloadResolver(segment.resolver)
        if (segment.prepare) {
          const result = segment.prepare(ctx)
          if (result) {
            for (const handle of result) {
              nextHandles.push(handle)
            }
          }
        }
      }

      releasePinned()
      pinnedHandles.current = nextHandles
      commit(next)
    }
    return router.listen(routes, transition)
  }, [router, routes, commit, releasePinned])

  useEffect(() => releasePinned, [releasePinned])

  return useMemo(() => {
    if (!route) return null

    return (route.data as RouteData[]).reduceRight<ReactNode>((children, segment) => {
      const props = (segment as { props?: Record<string, unknown> }).props ?? {}
      const Component = resolveSegmentComponent(segment)
      // segments without a component act as transparent passthroughs
      return Component ? <Component {...props}>{children}</Component> : children
    }, null)
  }, [router, route && route.pathname])
}

function resolveSegmentComponent(segment: RouteData): ComponentType<any> | null {
  if (segment.resolver) {
    return getResolverComponent(segment.resolver)
  }
  if (!segment.component) return null
  const c = segment.component as { default?: ComponentType<any> } & ComponentType<any>
  return c.default || c
}

function useScrollToTop(route: Route | null, disabled?: boolean) {
  const prevScrollGroup = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!route || disabled) return

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

// ---------------------------------------------------------------------------
// Link / Navigate
// ---------------------------------------------------------------------------

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
