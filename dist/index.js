import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, lazy as reactLazy, Suspense, useCallback, useContext, useState, useEffect, useMemo, useRef, useTransition, } from 'react';
import { createRouter, } from 'space-router';
export { qs } from 'space-router';
export function defineRoute(route) {
    return route;
}
export function defineRoutes(routes) {
    return routes;
}
const resolverPromiseCache = new WeakMap();
const resolverComponentCache = new WeakMap();
function preloadResolver(resolver) {
    let promise = resolverPromiseCache.get(resolver);
    if (!promise) {
        promise = resolver();
        resolverPromiseCache.set(resolver, promise);
    }
    return promise;
}
function getResolverComponent(resolver) {
    let component = resolverComponentCache.get(resolver);
    if (!component) {
        component = reactLazy(() => preloadResolver(resolver));
        resolverComponentCache.set(resolver, component);
    }
    return component;
}
function buildPrepareContext(route) {
    const r = route;
    return {
        pathname: r.pathname ?? '',
        url: r.pathname ?? '',
        params: r.params ?? {},
        query: r.query ?? {},
    };
}
export const RouterContext = createContext(undefined);
// Internal context for `<DelayedSuspense>`. Set by `<Router>` based on
// `usePending()` + a configurable threshold. `holding` is true only during
// the pre-commit window where we want the previous route to stay on screen.
const DelayedSuspenseContext = createContext(false);
function useRouterCtx() {
    const ctx = useContext(RouterContext);
    if (!ctx) {
        throw new Error('Application must be wrapped in <Router />');
    }
    return ctx;
}
export function useInternalRouterInstance() {
    return useRouterCtx().router;
}
export function useRoute() {
    return useRouterCtx().route;
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
export function usePending() {
    return useRouterCtx().isPending;
}
export function useNavigate() {
    const { router, route } = useRouterCtx();
    return useCallback((to) => {
        return router.navigate(to, route);
    }, [router, route]);
}
function makeRouter(routerOpts) {
    const router = createRouter({ mode: routerOpts.mode, qs: routerOpts.qs, sync: routerOpts.sync });
    return { router, routerOpts };
}
const DEFAULT_PENDING_DELAY_MS = 1000;
export function Router({ mode, qs, sync, transformRoute, pendingDelayMs = DEFAULT_PENDING_DELAY_MS, children, }) {
    const [{ router, routerOpts }, setRouter] = useState(() => makeRouter({ mode, qs, sync }));
    const [currRoute, setCurrRoute] = useState(null);
    const [isPending, startRouterTransition] = useTransition();
    // `holding` is true during the pre-commit window where `<DelayedSuspense>`
    // boundaries should re-throw their fallback (so the previous route stays
    // committed). It flips off either after `pendingDelayMs` elapses while
    // still pending, or when the transition settles — whichever comes first.
    const [holding, setHolding] = useState(false);
    useEffect(() => {
        if (!isPending) {
            setHolding(false);
            return;
        }
        setHolding(true);
        const t = setTimeout(() => setHolding(false), pendingDelayMs);
        return () => clearTimeout(t);
    }, [isPending, pendingDelayMs]);
    // Keep the latest transform in a ref so commit() can stay referentially
    // stable while always using the freshest function.
    const transformRef = useRef(transformRoute);
    transformRef.current = transformRoute;
    const commit = useCallback((next) => {
        const transform = transformRef.current;
        const transformed = transform ? (transform(next) ?? next) : next;
        startRouterTransition(() => {
            setCurrRoute(transformed);
        });
        // Sync the address bar if the transform rewrote the URL. We use
        // history.replaceState directly so we don't re-trigger the router's
        // listener loop.
        const matchedUrl = next.url;
        const transformedUrl = transformed.url;
        if (transformed !== next &&
            transformedUrl &&
            transformedUrl !== matchedUrl &&
            typeof window !== 'undefined' &&
            window.history) {
            window.history.replaceState({}, '', transformedUrl);
        }
    }, []);
    const ctx = useMemo(() => ({ router, route: currRoute, commit, isPending }), [router, currRoute, commit, isPending]);
    useEffect(() => {
        if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
            setRouter(makeRouter({ mode, qs, sync }));
        }
    }, [routerOpts, mode, qs, sync]);
    return (_jsx(RouterContext.Provider, { value: ctx, children: _jsx(DelayedSuspenseContext.Provider, { value: holding, children: children }) }));
}
export function DelayedSuspense({ fallback, children }) {
    const holding = useContext(DelayedSuspenseContext);
    return _jsx(Suspense, { fallback: holding ? _jsx(DelayedSuspenseHold, {}) : fallback, children: children });
}
const NEVER_RESOLVES = new Promise(() => { });
/**
 * Throws a never-resolving promise so the surrounding Suspense boundary's
 * fallback path itself suspends — the suspension bubbles up to the next
 * Suspense boundary above, which during a router transition is the
 * already-committed root holding the previous route.
 */
function DelayedSuspenseHold() {
    throw NEVER_RESOLVES;
}
export function Routes({ routes, disableScrollToTop }) {
    const { router, route, commit } = useRouterCtx();
    useScrollToTop(route, disableScrollToTop);
    // Pinned prepare handles for the currently committed navigation. Released
    // when a new navigation commits or when <Routes> unmounts.
    const pinnedHandles = useRef([]);
    const releasePinned = useCallback(() => {
        const handles = pinnedHandles.current;
        pinnedHandles.current = [];
        for (const handle of handles) {
            try {
                handle.release();
            }
            catch {
                // best-effort
            }
        }
    }, []);
    useEffect(() => {
        const transition = (next) => {
            const segments = (next.data ?? []);
            const ctx = buildPrepareContext(next);
            const nextHandles = [];
            for (const segment of segments) {
                if (segment.resolver)
                    preloadResolver(segment.resolver);
                if (segment.prepare) {
                    const result = segment.prepare(ctx);
                    if (result) {
                        for (const handle of result) {
                            nextHandles.push(handle);
                        }
                    }
                }
            }
            releasePinned();
            pinnedHandles.current = nextHandles;
            commit(next);
        };
        return router.listen(routes, transition);
    }, [router, routes, commit, releasePinned]);
    useEffect(() => releasePinned, [releasePinned]);
    return useMemo(() => {
        if (!route)
            return null;
        return route.data.reduceRight((children, segment) => {
            const props = segment.props ?? {};
            const Component = resolveSegmentComponent(segment);
            // segments without a component act as transparent passthroughs
            return Component ? _jsx(Component, { ...props, children: children }) : children;
        }, null);
    }, [router, route && route.pathname]);
}
function resolveSegmentComponent(segment) {
    if (segment.resolver) {
        return getResolverComponent(segment.resolver);
    }
    if (!segment.component)
        return null;
    const c = segment.component;
    return c.default || c;
}
function useScrollToTop(route, disabled) {
    const prevScrollGroup = useRef(undefined);
    useEffect(() => {
        if (!route || disabled)
            return;
        const datas = route.data;
        const data = datas[datas.length - 1];
        const scrollGroup = data.scrollGroup || route.pathname;
        if (prevScrollGroup.current !== scrollGroup) {
            prevScrollGroup.current = scrollGroup;
            if (typeof window !== 'undefined') {
                window.scrollTo(0, 0);
            }
        }
    }, [route && route.pathname, disabled]);
}
// ---------------------------------------------------------------------------
// Link / Navigate
// ---------------------------------------------------------------------------
export function useMakeHref() {
    const { href } = useInternalRouterInstance();
    return href;
}
export function useLinkProps(to) {
    const target = typeof to === 'string' ? { url: to } : to;
    const currRoute = useRoute();
    const navigate = useNavigate();
    const makeHref = useMakeHref();
    const href = target.url ? target.url : makeHref(target, currRoute);
    const isCurrent = typeof target.current === 'undefined'
        ? currRoute?.pathname === href.replace(/^#/, '').split('?')[0]
        : target.current;
    function onClick(event) {
        if (target.onClick)
            target.onClick(event);
        if (shouldNavigate(event)) {
            event.preventDefault();
            navigate(target);
        }
    }
    return {
        href,
        'aria-current': isCurrent ? 'page' : undefined,
        onClick,
    };
}
export function Link({ href: to, replace, current, className, style, extraProps, children, ...anchorProps }) {
    const linkTo = typeof to === 'string'
        ? { url: to, replace, current }
        : { ...to, replace, current };
    const linkProps = useLinkProps(linkTo);
    const isCurrent = linkProps['aria-current'] === 'page';
    const evaluate = (valOrFn) => (typeof valOrFn === 'function' ? valOrFn(isCurrent) : valOrFn);
    return (_jsx("a", { "aria-current": linkProps['aria-current'], ...anchorProps, className: evaluate(className), style: evaluate(style), ...(extraProps ? extraProps(isCurrent) : {}), href: linkProps.href, 
        // eslint-disable-next-line react/jsx-handler-names
        onClick: linkProps.onClick, children: children }));
}
export function Navigate({ to }) {
    const [navigated, setNavigated] = useState(false);
    const navigate = useNavigate();
    useEffect(() => {
        if (!navigated) {
            navigate(to);
            setNavigated(true);
        }
    }, [navigated]);
    return null;
}
export function shouldNavigate(e) {
    if (e.defaultPrevented || e.button !== 0)
        return false;
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
        return false;
    const el = e.currentTarget;
    if (el && el.tagName === 'A') {
        const a = el;
        // let the browser handle these: opening in a new tab/window, downloads,
        // and cross-origin or non-http(s) protocols (mailto:, tel:, ...)
        if (a.target && a.target !== '_self')
            return false;
        if (a.hasAttribute('download'))
            return false;
        if (a.origin && a.origin !== window.location.origin)
            return false;
    }
    return true;
}
//# sourceMappingURL=index.js.map