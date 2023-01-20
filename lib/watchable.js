"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** Makes any **type T** "watchable" by providing the ability to add value change listeners.
 *
 * Use the value property to access the wrapped type T */
var Watchable = /** @class */ (function () {
    function Watchable(initialValue) {
        this._callbacks = {};
        this._toRemove = new Set();
        this._predicates = {};
        this._proxy = this._deepProxy({ value: initialValue });
    }
    Object.defineProperty(Watchable.prototype, "value", {
        get: function () {
            return this._proxy.value;
        },
        set: function (x) {
            this._oldValue = this.value;
            if (x && typeof x === "object") {
                this._proxy.value = this._deepProxy(x);
            }
            else {
                this._proxy.value = x;
            }
        },
        enumerable: false,
        configurable: true
    });
    Watchable.prototype._deepProxy = function (obj) {
        for (var _i = 0, _a = Object.entries(obj); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            if (value && typeof value === "object") {
                obj[key] = this._deepProxy(value);
            }
        }
        return this._createProxy(obj);
    };
    Watchable.prototype._createProxy = function (obj) {
        var _this = this;
        return new Proxy(obj, {
            set: function (t, p, v) {
                var oldValue = (_this._oldValue = t[p]);
                if (oldValue === v)
                    return true;
                if (v && typeof v === "object")
                    t[p] = _this._deepProxy(v);
                else
                    t[p] = v;
                _this._runCallbacks({
                    newValue: v,
                    oldValue: oldValue,
                    property: p.toString(),
                    target: t,
                    root: _this.value
                });
                return true;
            }
        });
    };
    Watchable.prototype._getNestedValue = function (path) {
        var value = this.value;
        var obj = this._proxy;
        var keys = path.split(".");
        try {
            for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
                var key = keys_1[_i];
                if (value && typeof value === "object")
                    obj = value;
                value = value[key];
            }
        }
        catch (error) {
            console.error(error);
            value = undefined;
        }
        return [value, obj];
    };
    Watchable.prototype._getCallbackKey = function (callback) {
        return callback.name ? callback.name : callback.toString();
    };
    Watchable.prototype._runCallbacks = function (e) {
        for (var _i = 0, _a = Object.values(this._callbacks); _i < _a.length; _i++) {
            var callback = _a[_i];
            var execute = true;
            var callbackKey = this._getCallbackKey(callback);
            if (callbackKey in this._predicates) {
                var condition = this._predicates[callbackKey];
                if (condition.propertyPath &&
                    typeof this.value === "object" &&
                    this.value) {
                    e.res = this._getNestedValue(condition.propertyPath)[0];
                }
                if (!condition.predicate(e)) {
                    execute = false;
                }
            }
            if (execute) {
                callback(e);
                if (this._toRemove.delete(callbackKey)) {
                    delete this._predicates[callbackKey];
                    this.removeChangeListener(callback);
                }
            }
        }
    };
    Watchable.prototype.when = function (predicateValueOrProp, callbackValueOrPredicate, callback) {
        if (predicateValueOrProp &&
            this.value &&
            callbackValueOrPredicate &&
            callback) {
            if (typeof this.value !== "object") {
                throw "Cannot use this when() overload when Watchable is not wrapping an object type";
            }
            var _a = this._getNestedValue(predicateValueOrProp), val = _a[0], obj = _a[1];
            var changeEvent = {
                newValue: val,
                oldValue: this._oldValue,
                property: predicateValueOrProp.split(".").at(-1),
                root: this.value,
                target: obj,
                res: val
            };
            if (typeof callbackValueOrPredicate === "function") {
                if (callbackValueOrPredicate(changeEvent)) {
                    callback(changeEvent);
                }
                else {
                    this.addChangeListener(callback, {
                        once: true,
                        condition: {
                            propertyPath: predicateValueOrProp,
                            predicate: callbackValueOrPredicate
                        }
                    });
                }
            }
            else {
                if (callbackValueOrPredicate === val) {
                    callback(changeEvent);
                }
                else {
                    this.addChangeListener(callback, {
                        once: true,
                        condition: {
                            propertyPath: predicateValueOrProp,
                            predicate: function (e) {
                                return (e === null || e === void 0 ? void 0 : e.res) === callbackValueOrPredicate;
                            }
                        }
                    });
                }
            }
        }
        else if (typeof predicateValueOrProp === "function") {
            var changeEvent = {
                newValue: this.value,
                oldValue: this._oldValue,
                root: this.value
            };
            if (predicateValueOrProp(changeEvent)) {
                callbackValueOrPredicate(changeEvent);
            }
            else {
                this.addChangeListener(callbackValueOrPredicate, {
                    once: true,
                    condition: {
                        predicate: predicateValueOrProp
                    }
                });
            }
        }
        else {
            var changeEvent = {
                newValue: this.value,
                oldValue: this._oldValue,
                root: this.value
            };
            if (predicateValueOrProp === this.value) {
                callbackValueOrPredicate(changeEvent);
            }
            else {
                this.addChangeListener(callbackValueOrPredicate, {
                    once: true,
                    condition: {
                        predicate: function (x) { return (x === null || x === void 0 ? void 0 : x.newValue) === predicateValueOrProp; }
                    }
                });
            }
        }
    };
    /** Adds the provided callback to the change listeners
     * @options once: if true, callback is removed after its first trigger
     * @options condition: if provided, the callback will only trigger if condition.predicate returns true
     * @options condition.propertyPath: a string matching the . notation lookup of a (nested) property. May provide if T is an object. Populates the condition.predicate function's
     * ChangeEvent parameter's "res" property with the resolution of the path (if there is one). _E.g. employee.name.last looks up this.value.employee.name.last_
     */
    Watchable.prototype.addChangeListener = function (callback, options) {
        if (options === void 0) { options = { once: false }; }
        var callbackKey = this._getCallbackKey(callback);
        this._callbacks[callbackKey] = callback;
        if (options) {
            if (options.once) {
                this._toRemove.add(callbackKey);
            }
            if (options.condition) {
                this._predicates[callbackKey] = options.condition;
            }
        }
    };
    /** Removes the provided callback from the change listeners */
    Watchable.prototype.removeChangeListener = function (callback) {
        var callbackKey = this._getCallbackKey(callback);
        delete this._callbacks[callbackKey];
    };
    /** Removes all change listeners */
    Watchable.prototype.clearListeners = function () {
        for (var prop in this._callbacks) {
            delete this._callbacks[prop];
        }
    };
    return Watchable;
}());
exports.default = Watchable;
