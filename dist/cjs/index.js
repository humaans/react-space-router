"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get CurrRouteContext () {
        return CurrRouteContext;
    },
    get Link () {
        return Link;
    },
    get Navigate () {
        return Navigate;
    },
    get Router () {
        return Router;
    },
    get RouterContext () {
        return RouterContext;
    },
    get Routes () {
        return Routes;
    },
    get qs () {
        return _spacerouter.qs;
    },
    get shouldNavigate () {
        return shouldNavigate;
    },
    get useInternalRouterInstance () {
        return useInternalRouterInstance;
    },
    get useLinkProps () {
        return useLinkProps;
    },
    get useMakeHref () {
        return useMakeHref;
    },
    get useNavigate () {
        return useNavigate;
    },
    get useRoute () {
        return useRoute;
    }
});
var _react = /*#__PURE__*/ _interop_require_wildcard(require("react"));
var _spacerouter = require("space-router");
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
function _getRequireWildcardCache(nodeInterop) {
    if (typeof WeakMap !== "function") return null;
    var cacheBabelInterop = new WeakMap();
    var cacheNodeInterop = new WeakMap();
    return (_getRequireWildcardCache = function(nodeInterop) {
        return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
    })(nodeInterop);
}
function _interop_require_wildcard(obj, nodeInterop) {
    if (!nodeInterop && obj && obj.__esModule) {
        return obj;
    }
    if (obj === null || typeof obj !== "object" && typeof obj !== "function") {
        return {
            default: obj
        };
    }
    var cache = _getRequireWildcardCache(nodeInterop);
    if (cache && cache.has(obj)) {
        return cache.get(obj);
    }
    var newObj = {
        __proto__: null
    };
    var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
    for(var key in obj){
        if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
            if (desc && (desc.get || desc.set)) {
                Object.defineProperty(newObj, key, desc);
            } else {
                newObj[key] = obj[key];
            }
        }
    }
    newObj.default = obj;
    if (cache) {
        cache.set(obj, newObj);
    }
    return newObj;
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
    var target = {}, sourceKeys, key, i;
    if (typeof Reflect !== "undefined" && Reflect.ownKeys) {
        sourceKeys = Reflect.ownKeys(source);
        for(i = 0; i < sourceKeys.length; i++){
            key = sourceKeys[i];
            if (excluded.indexOf(key) >= 0) continue;
            if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
            target[key] = source[key];
        }
        return target;
    }
    target = _object_without_properties_loose(source, excluded);
    if (Object.getOwnPropertySymbols) {
        sourceKeys = Object.getOwnPropertySymbols(source);
        for(i = 0; i < sourceKeys.length; i++){
            key = sourceKeys[i];
            if (excluded.indexOf(key) >= 0) continue;
            if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
            target[key] = source[key];
        }
    }
    return target;
}
function _object_without_properties_loose(source, excluded) {
    if (source == null) return {};
    var target = {}, sourceKeys = Object.getOwnPropertyNames(source), key, i;
    for(i = 0; i < sourceKeys.length; i++){
        key = sourceKeys[i];
        if (excluded.indexOf(key) >= 0) continue;
        if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
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
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
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
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
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
var RouterContext = /*#__PURE__*/ (0, _react.createContext)();
var CurrRouteContext = /*#__PURE__*/ (0, _react.createContext)();
function useInternalRouterInstance() {
    var router = (0, _react.useContext)(RouterContext).router;
    if (!router) {
        throw new Error('Application must be wrapped in <Router />');
    }
    return router;
}
function useRoute() {
    for(var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++){
        args[_key] = arguments[_key];
    }
    var _useContext;
    return (_useContext = (0, _react.useContext)(RouterContext)).useRoute.apply(_useContext, _to_consumable_array(args));
}
function useNavigate() {
    var currRoute = useRoute();
    var navigate = useInternalRouterInstance().navigate;
    return (0, _react.useCallback)(function(to) {
        return navigate(to, currRoute);
    }, [
        navigate,
        currRoute
    ]);
}
/**
 * When router state is not stored in an external store
 * by default, we read the current route from the CurrRouteContext
 */ function defaultUseRoute() {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return (0, _react.useContext)(CurrRouteContext);
}
function makeRouter(routerOpts) {
    var router = (0, _spacerouter.createRouter)(routerOpts);
    router.disableScrollToTop = routerOpts.disableScrollToTop;
    return {
        router: router,
        routerOpts: routerOpts
    };
}
function Router(param) {
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
    var _useState = _sliced_to_array((0, _react.useState)(function() {
        return makeRouter({
            mode: mode,
            qs: qs,
            sync: sync
        });
    }), 2), _useState_ = _useState[0], router = _useState_.router, routerOpts = _useState_.routerOpts, setRouter = _useState[1];
    // store current and next routes in the state
    var _useState1 = _sliced_to_array((0, _react.useState)(null), 2), currRoute = _useState1[0], setCurrRoute = _useState1[1];
    // create a "connected" router, this is what allows us
    // to externalise the state in case when useRoute is provided
    // this wrapped (or "connected") router is what we put into context
    var connectedRouter = (0, _react.useMemo)(function() {
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
    (0, _react.useEffect)(function() {
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
    return /*#__PURE__*/ _react.default.createElement(RouterContext.Provider, {
        value: connectedRouter
    }, /*#__PURE__*/ _react.default.createElement(CurrRouteContext.Provider, {
        value: currRoute
    }, children));
}
function Routes(param) {
    var // route config
    routes = param.routes, // disable scroll to top behaviour after navigations
    disableScrollToTop = param.disableScrollToTop;
    var _useContext = (0, _react.useContext)(RouterContext), router = _useContext.router, onNavigating = _useContext.onNavigating, onNavigated = _useContext.onNavigated;
    var route = useRoute();
    var onlyLatest = useOnlyLatest();
    useScrollToTop(route, disableScrollToTop);
    (0, _react.useEffect)(function() {
        var transition = function(route) {
            onlyLatest(function(isLatest) {
                return _async_to_generator(function() {
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
                })();
            });
        };
        return router.listen(routes, transition);
    }, [
        router,
        routes,
        onNavigating,
        onNavigated
    ]);
    return (0, _react.useMemo)(function() {
        if (!route) {
            return null;
        }
        return route.data.reduceRight(function(children, param) {
            var _param_props = param.props, props = _param_props === void 0 ? {} : _param_props, component = param.component;
            var Component = component ? component.default || component : null;
            return Component ? /*#__PURE__*/ _react.default.createElement(Component, props, children) : null;
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
    var prevScrollGroup = (0, _react.useRef)();
    (0, _react.useEffect)(function() {
        if (!route || disabled) {
            return;
        }
        var datas = route.data;
        var data = datas[datas.length - 1];
        var scrollGroup = data.scrollGroup || route.pathname;
        if (prevScrollGroup.current !== scrollGroup) {
            prevScrollGroup.current = scrollGroup;
            if (typeof window !== 'undefined') {
                window.scrollTo(0, 0);
            }
        }
    }, [
        route && route.pathname,
        disabled
    ]);
}
function useMakeHref() {
    var href = useInternalRouterInstance().href;
    return href;
}
function useLinkProps(to) {
    if (typeof to === 'string') {
        to = {
            url: to
        };
    }
    var currRoute = useRoute();
    var navigate = useNavigate();
    var makeHref = useMakeHref();
    // to compute if route is active, we resolve the full url
    var href = to.url ? to.url : makeHref(to, currRoute);
    var isCurrent = typeof to.current === 'undefined' ? currRoute.pathname === href.replace(/^#/, '').split('?')[0] : to.current;
    function onClick(event) {
        to.onClick && to.onClick(event);
        if (shouldNavigate(event)) {
            event.preventDefault();
            navigate(to);
        }
    }
    return {
        href: href,
        'aria-current': isCurrent ? 'page' : undefined,
        onClick: onClick
    };
}
function Link(_0) {
    var to = _0.href, replace = _0.replace, current = _0.current, className = _0.className, style = _0.style, extraProps = _0.extraProps, children = _0.children, anchorProps = _object_without_properties(_0, [
        "href",
        "replace",
        "current",
        "className",
        "style",
        "extraProps",
        "children"
    ]);
    if (typeof to === 'string') {
        to = {
            url: to
        };
    }
    var linkProps = useLinkProps(_object_spread_props(_object_spread({}, to), {
        replace: replace,
        current: current
    }));
    var isCurrent = linkProps['aria-current'] === 'page';
    var evaluate = function(valOrFn) {
        return typeof valOrFn === 'function' ? valOrFn(isCurrent) : valOrFn;
    };
    return /*#__PURE__*/ _react.default.createElement("a", _object_spread_props(_object_spread(_object_spread_props(_object_spread({
        "aria-current": linkProps['aria-current']
    }, anchorProps), {
        className: evaluate(className),
        style: evaluate(style)
    }), extraProps ? extraProps(isCurrent) : {}), {
        href: linkProps.href,
        // eslint-disable-next-line react/jsx-handler-names
        onClick: linkProps.onClick
    }), children);
}
function Navigate(param) {
    var to = param.to;
    var _useState = _sliced_to_array((0, _react.useState)(false), 2), navigated = _useState[0], setNavigated = _useState[1];
    var navigate = useNavigate();
    (0, _react.useEffect)(function() {
        if (!navigated) {
            navigate(to);
            setNavigated(true);
        }
    }, [
        navigated
    ]);
    return null;
}
function shouldNavigate(e) {
    return !e.defaultPrevented && e.button === 0 && !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}
/**
 * A helper hook for safely executing async logic where isLatest()
 * can be called to check if the function is still the latest one
 * being executed
 */ function useOnlyLatest() {
    var seq = (0, _react.useRef)(0);
    return function(fn) {
        seq.current += 1;
        var curr = seq.current;
        var isLatest = function() {
            return seq.current === curr;
        };
        return fn(isLatest);
    };
}
