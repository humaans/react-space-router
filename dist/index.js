import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef, } from 'react';
import { createRouter, } from 'space-router';
export { qs } from 'space-router';
export const RouterContext = createContext(undefined);
export const CurrRouteContext = createContext(null);
export function useInternalRouterInstance() {
    const ctx = useContext(RouterContext);
    if (!ctx?.router) {
        throw new Error('Application must be wrapped in <Router />');
    }
    return ctx.router;
}
export function useRoute() {
    return useContext(RouterContext).useRoute();
}
export function useNavigate() {
    const currRoute = useRoute();
    const navigate = useInternalRouterInstance().navigate;
    return useCallback((to) => {
        return navigate(to, currRoute);
    }, [navigate, currRoute]);
}
function defaultUseRoute() {
    return useContext(CurrRouteContext);
}
function makeRouter(routerOpts) {
    const router = createRouter({ mode: routerOpts.mode, qs: routerOpts.qs, sync: routerOpts.sync });
    router.disableScrollToTop = routerOpts.disableScrollToTop;
    return { router: router, routerOpts };
}
export function Router({ mode, qs, sync, useRoute, onNavigating, onNavigated, children }) {
    const [{ router, routerOpts }, setRouter] = useState(() => makeRouter({ mode, qs, sync }));
    const [currRoute, setCurrRoute] = useState(null);
    const connectedRouter = useMemo(() => ({
        router,
        useRoute: useRoute || defaultUseRoute,
        onNavigating,
        onNavigated(route) {
            if (!useRoute) {
                setCurrRoute(route);
            }
            if (onNavigated)
                onNavigated(route);
        },
    }), [router, useRoute, onNavigating, onNavigated]);
    useEffect(() => {
        if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
            setRouter(makeRouter({ mode, qs, sync }));
        }
    }, [routerOpts, mode, qs, sync]);
    return (_jsx(RouterContext.Provider, { value: connectedRouter, children: _jsx(CurrRouteContext.Provider, { value: currRoute, children: children }) }));
}
export function Routes({ routes, disableScrollToTop }) {
    const ctx = useContext(RouterContext);
    const { router, onNavigating, onNavigated } = ctx;
    const route = ctx.useRoute();
    const onlyLatest = useOnlyLatest();
    useScrollToTop(route, disableScrollToTop);
    useEffect(() => {
        const transition = (next) => {
            onlyLatest(async (isLatest) => {
                if (isLatest() && onNavigating) {
                    await onNavigating(next);
                }
                if (isLatest()) {
                    onNavigated(next);
                }
            });
        };
        return router.listen(routes, transition);
    }, [router, routes, onNavigating, onNavigated]);
    return useMemo(() => {
        if (!route) {
            return null;
        }
        return route.data.reduceRight((children, segment) => {
            const props = segment.props ?? {};
            const component = segment.component;
            const Component = resolveComponent(component);
            // segments without a component act as transparent passthroughs so descendants still render
            return Component ? _jsx(Component, { ...props, children: children }) : children;
        }, null);
    }, [router, route && route.pathname]);
}
function resolveComponent(component) {
    if (!component)
        return null;
    const c = component;
    return c.default || c;
}
function useScrollToTop(route, disabled) {
    const prevScrollGroup = useRef(undefined);
    useEffect(() => {
        if (!route || disabled) {
            return;
        }
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
function useOnlyLatest() {
    const seq = useRef(0);
    return (fn) => {
        seq.current += 1;
        const curr = seq.current;
        const isLatest = () => seq.current === curr;
        return fn(isLatest);
    };
}
//# sourceMappingURL=index.js.map