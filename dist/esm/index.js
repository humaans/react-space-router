function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
}
function _iterable_to_array_limit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;
    var _s, _e;
    try {
        for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
        }
    } catch (err) {
        _d = true;
        _e = err;
    } finally{
        try {
            if (!_n && _i["return"] != null) _i["return"]();
        } finally{
            if (_d) throw _e;
        }
    }
    return _arr;
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _object_spread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _define_property(target, key, source[key]);
        });
    }
    return target;
}
function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);
    if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) {
            symbols = symbols.filter(function(sym) {
                return Object.getOwnPropertyDescriptor(object, sym).enumerable;
            });
        }
        keys.push.apply(keys, symbols);
    }
    return keys;
}
function _object_spread_props(target, source) {
    source = source != null ? source : {};
    if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
        ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
    }
    return target;
}
function _object_without_properties(source, excluded) {
    if (source == null) return {};
    var target = _object_without_properties_loose(source, excluded);
    var key, i;
    if (Object.getOwnPropertySymbols) {
        var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
        for(i = 0; i < sourceSymbolKeys.length; i++){
            key = sourceSymbolKeys[i];
            if (excluded.indexOf(key) >= 0) continue;
            if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
            target[key] = source[key];
        }
    }
    return target;
}
function _object_without_properties_loose(source, excluded) {
    if (source == null) return {};
    var target = {};
    var sourceKeys = Object.keys(source);
    var key, i;
    for(i = 0; i < sourceKeys.length; i++){
        key = sourceKeys[i];
        if (excluded.indexOf(key) >= 0) continue;
        target[key] = source[key];
    }
    return target;
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
}
function _to_consumable_array(arr) {
    return _array_without_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_spread();
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
function _ts_generator(thisArg, body) {
    var f, y, t, g, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    };
    return g = {
        next: verb(0),
        "throw": verb(1),
        "return": verb(2)
    }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(_)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { createRouter } from "space-router";
export { qs } from "space-router";
export var RouterContext = /*#__PURE__*/ createContext();
export var CurrRouteContext = /*#__PURE__*/ createContext();
/**
 * Hook for getting the space router instance,
 * normally React Space Router consumers should
 * never need to use this directly. Other hooks
 * expose the right functionality. This avoids
 * leaking complexity due to space-router being
 * more imperative and React hooks more declarative.
 */ export function useInternalRouterInstance() {
    var router = useContext(RouterContext).router;
    if (!router) {
        throw new Error("Application must be wrapped in <Router />");
    }
    return router;
}
/**
 * Hook for getting the currently active route
 */ export function useRoute() {
    for(var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++){
        args[_key] = arguments[_key];
    }
    var _useContext;
    return (_useContext = useContext(RouterContext)).useRoute.apply(_useContext, _to_consumable_array(args));
}
/**
 * A hook for navigating around the app
 */ export function useNavigate() {
    var route = useRoute();
    var navigate = useInternalRouterInstance().navigate;
    return withMerge(navigate, route);
}
/**
 * Since React Space Router allows async route loading/processing, we make sure that the
 * currently active route that's displayed on the screen gets used instead of the next
 * route that will be rendered, when merge: true is used to compute hrefs
 *
 * Note: with Suspense this will not work the same, as we will trigger onNavigated right away,
 * so I'm not sure how to handle the state in that case, not sure how to access the pre-suspension
 * state, but this will work correctly for now if onNavigating is async and blocking
 */ function withMerge(navigate, currRoute) {
    return function(to) {
        return navigate(to, currRoute);
    };
}
/**
 * When router state is not stored in an external store
 * by default, we read the current route from the CurrRouteContext
 */ function defaultUseRoute() {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(CurrRouteContext);
}
function makeRouter(routerOpts) {
    var router = createRouter(routerOpts);
    router.disableScrollToTop = routerOpts.disableScrollToTop;
    return {
        router: router,
        routerOpts: routerOpts
    };
}
/**
 * The application must be wrapped in a Router component,
 * this is what provides all of the required context for accessing
 * the navigation function and the router state
 */ export function Router(param) {
    var // history | hash | memory
    mode = param.mode, // custom query string parser/stringifier
    qs = param.qs, // setting sync to true will rerender synchronously
    sync = param.sync, // a hook for subscribing to the current route in the external store
    useRoute = param.useRoute, // callback for when navigation starts, by default, noop
    onNavigating = param.onNavigating, // callback for when navigation completed
    onNavigated = param.onNavigated, // the rest of the app
    children = param.children;
    // we create the space router instance on the initial mount
    // and we'll recreate it later only if some of the props changed
    var _useState = _sliced_to_array(useState(function() {
        return makeRouter({
            mode: mode,
            qs: qs,
            sync: sync
        });
    }), 2), _useState_ = _useState[0], router = _useState_.router, routerOpts = _useState_.routerOpts, setRouter = _useState[1];
    // store current and next routes in the state
    var _useState1 = _sliced_to_array(useState(null), 2), currRoute = _useState1[0], setCurrRoute = _useState1[1];
    // create a "connected" router, this is what allows us
    // to externalise the state in case when useRoute is provided
    // this wrapped (or "connected") router is what we put into context
    var connectedRouter = useMemo(function() {
        return {
            router: router,
            useRoute: useRoute || defaultUseRoute,
            onNavigating: onNavigating,
            onNavigated: function onNavigated1(currRoute) {
                if (!useRoute) {
                    setCurrRoute(currRoute);
                }
                onNavigated && onNavigated(currRoute);
            }
        };
    }, [
        router,
        useRoute,
        onNavigating,
        onNavigated
    ]);
    // recreate the router if any of it's options are changed
    useEffect(function() {
        if (routerOpts.mode !== mode || routerOpts.qs !== qs || routerOpts.sync !== sync) {
            setRouter(makeRouter({
                mode: mode,
                qs: qs,
                sync: sync
            }));
        }
    }, [
        routerOpts,
        mode,
        qs,
        sync
    ]);
    return /*#__PURE__*/ React.createElement(RouterContext.Provider, {
        value: connectedRouter
    }, /*#__PURE__*/ React.createElement(CurrRouteContext.Provider, {
        value: currRoute
    }, children));
}
/**
 * Routes component subscribes to the route changes
 * and renders the route's components in a nested way
 */ export function Routes(param) {
    var // route config
    routes = param.routes, // disable scroll to top behaviour after navigations
    disableScrollToTop = param.disableScrollToTop;
    var _useContext = useContext(RouterContext), router = _useContext.router, onNavigating = _useContext.onNavigating, onNavigated = _useContext.onNavigated;
    var route = useRoute();
    var onlyLatest = useOnlyLatest();
    useScrollToTop(route, disableScrollToTop);
    useEffect(function() {
        var transition = function(route) {
            onlyLatest(function() {
                var _ref = _async_to_generator(function(isLatest) {
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                if (!(isLatest() && onNavigating)) return [
                                    3,
                                    2
                                ];
                                return [
                                    4,
                                    onNavigating(route)
                                ];
                            case 1:
                                _state.sent();
                                _state.label = 2;
                            case 2:
                                if (isLatest()) {
                                    onNavigated(route);
                                }
                                return [
                                    2
                                ];
                        }
                    });
                });
                return function(isLatest) {
                    return _ref.apply(this, arguments);
                };
            }());
        };
        return router.listen(routes, transition);
    }, [
        router,
        routes,
        onNavigating,
        onNavigated
    ]);
    return useMemo(function() {
        if (!route) {
            return null;
        }
        return route.data.reduceRight(function(children, param) {
            var _param_props = param.props, props = _param_props === void 0 ? {} : _param_props, component = param.component;
            var Component = component ? component.default || component : null;
            return Component ? /*#__PURE__*/ React.createElement(Component, props, children) : null;
        }, null);
    }, [
        router,
        route && route.pathname
    ]);
}
/**
 * We use this to scroll to top after each navigation,
 * while taking into account any custom scrollGroups as
 * configured as part of the route data
 */ function useScrollToTop(route, disabled) {
    var prevScrollGroup = useRef();
    useEffect(function() {
        if (!route || disabled) {
            return;
        }
        var datas = route.data;
        var data = datas[datas.length - 1];
        var scrollGroup = data.scrollGroup || route.pathname;
        if (prevScrollGroup.current !== scrollGroup) {
            prevScrollGroup.current = scrollGroup;
            if (typeof window !== "undefined") {
                window.scrollTo(0, 0);
            }
        }
    }, [
        route && route.pathname,
        disabled
    ]);
}
/**
 * Expose router.href via useMakeHref, so that
 * React Space Router consumers never need to
 * directly use the router instance.
 */ export function useMakeHref() {
    var href = useInternalRouterInstance().href;
    return href;
}
/**
 * useLinkProps hook can be used instead of Link component
 * for more flexibility or when more convenient
 */ export function useLinkProps(to) {
    if (typeof to === "string") {
        to = {
            url: to
        };
    }
    var currRoute = useRoute();
    var navigate = useNavigate();
    var makeHref = useMakeHref();
    // to compute if route is active, we resolve the full url
    var href = to.url ? to.url : makeHref(to, currRoute);
    var isCurrent = typeof to.current === "undefined" ? currRoute.pathname === href.replace(/^#/, "").split("?")[0] : to.current;
    function onClick(event) {
        to.onClick && to.onClick(event);
        if (shouldNavigate(event)) {
            event.preventDefault();
            navigate(to);
        }
    }
    return {
        href: href,
        "aria-current": isCurrent ? "page" : undefined,
        onClick: onClick
    };
}
/**
 * Link component
 */ export function Link(_param) {
    var to = _param.href, replace = _param.replace, current = _param.current, className = _param.className, style = _param.style, extraProps = _param.extraProps, children = _param.children, anchorProps = _object_without_properties(_param, [
        "href",
        "replace",
        "current",
        "className",
        "style",
        "extraProps",
        "children"
    ]);
    if (typeof to === "string") {
        to = {
            url: to
        };
    }
    var linkProps = useLinkProps(_object_spread_props(_object_spread({}, to), {
        replace: replace,
        current: current
    }));
    var isCurrent = linkProps["aria-current"] === "page";
    var evaluate = function(valOrFn) {
        return typeof valOrFn === "function" ? valOrFn(isCurrent) : valOrFn;
    };
    return /*#__PURE__*/ React.createElement("a", _object_spread_props(_object_spread(_object_spread_props(_object_spread({
        "aria-current": linkProps["aria-current"]
    }, anchorProps), {
        className: evaluate(className),
        style: evaluate(style)
    }), extraProps ? extraProps(isCurrent) : {}), {
        href: linkProps.href,
        // eslint-disable-next-line react/jsx-handler-names
        onClick: linkProps.onClick
    }), children);
}
/**
 * Navigate component is used to declaratively redirect
 */ export function Navigate(param) {
    var to = param.to;
    var _useState = _sliced_to_array(useState(false), 2), navigated = _useState[0], setNavigated = _useState[1];
    var navigate = useNavigate();
    useEffect(function() {
        if (!navigated) {
            navigate(to);
            setNavigated(true);
        }
    }, [
        navigated
    ]);
    return null;
}
/**
 * Check if this link click event should be navigated using the router,
 * or if we should yield to the default browser navigation behaviour
 */ export function shouldNavigate(e) {
    return !e.defaultPrevented && e.button === 0 && !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}
/**
 * A helper hook for safely executing async logic where isLatest()
 * can be called to check if the function is still the latest one
 * being executed
 */ function useOnlyLatest() {
    var seq = useRef(0);
    return function(fn) {
        seq.current += 1;
        var curr = seq.current;
        var isLatest = function() {
            return seq.current === curr;
        };
        return fn(isLatest);
    };
}
