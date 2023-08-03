"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/** Makes any **type T** "watchable" by providing the ability to add value change listeners.
 *
 * Use the value property to access the wrapped type T */
class Watchable {
    constructor(initialValue) {
        this._callbacks = {};
        this._toRemove = new Set();
        this._predicates = {};
        this.propRegEx = /(?:(\w+)$)|(?:(\w+)(?=\.|\[))|(?:\[["]([^"]*)["]])|(?:\[[']([^']*)[']])/gm;
        this._proxy = this._deepProxy({ value: initialValue });
    }
    get value() {
        return this._proxy.value;
    }
    set value(x) {
        this._oldValue = this.value;
        if (x && typeof x === "object") {
            this._proxy.value = this._deepProxy(x);
        }
        else {
            this._proxy.value = x;
        }
    }
    _deepProxy(obj) {
        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === "object") {
                obj[key] = this._deepProxy(value);
            }
        }
        return this._createProxy(obj);
    }
    _createProxy(obj) {
        return new Proxy(obj, {
            set: (t, p, v) => {
                const oldValue = (this._oldValue = t[p]);
                if (oldValue === v)
                    return true;
                if (v && typeof v === "object")
                    t[p] = this._deepProxy(v);
                else
                    t[p] = v;
                this._runCallbacks({
                    newValue: v,
                    oldValue: oldValue,
                    property: p.toString(),
                    target: t,
                    root: this.value
                });
                return true;
            }
        });
    }
    _getNestedValue(path) {
        let value = this.value;
        let obj = this._proxy;
        const keys = [];
        for (const match of path.matchAll(this.propRegEx)) {
            keys.push(match.slice(1).find((v) => v));
        }
        try {
            for (const key of keys) {
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
    }
    _getCallbackKey(callback) {
        return callback.name ? callback.name : callback.toString();
    }
    _runCallbacks(e) {
        for (let callback of Object.values(this._callbacks)) {
            let execute = true;
            const callbackKey = this._getCallbackKey(callback);
            if (callbackKey in this._predicates) {
                const condition = this._predicates[callbackKey];
                if (condition.propertyPath &&
                    typeof this.value === "object" &&
                    this.value) {
                    [e.res] = this._getNestedValue(condition.propertyPath);
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
    }
    promiseWhen(predicateValueOrProp, value) {
        return new Promise((res) => {
            this.when(predicateValueOrProp, value, () => {
                res();
            });
        });
    }
    when(predicateValueOrProp, callbackValueOrPredicate, callback) {
        if (predicateValueOrProp &&
            this.value &&
            callbackValueOrPredicate &&
            callback) {
            if (typeof this.value !== "object") {
                throw "Cannot use this when() overload when Watchable is not wrapping an object type";
            }
            const [val, obj] = this._getNestedValue(predicateValueOrProp);
            const changeEvent = {
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
                            predicate: (e) => (e === null || e === void 0 ? void 0 : e.res) === callbackValueOrPredicate
                        }
                    });
                }
            }
        }
        else if (typeof predicateValueOrProp === "function") {
            const changeEvent = {
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
            const changeEvent = {
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
                        predicate: (x) => (x === null || x === void 0 ? void 0 : x.newValue) === predicateValueOrProp
                    }
                });
            }
        }
    }
    /** Adds the provided callback to the change listeners
     * @options once: if true, callback is removed after its first trigger
     * @options condition: if provided, the callback will only trigger if condition.predicate returns true
     * @options condition.propertyPath: a string matching the . notation lookup of a (nested) property. May provide if T is an object. Populates the condition.predicate function's
     * ChangeEvent parameter's "res" property with the resolution of the path (if there is one). _E.g. employee.name.last looks up this.value.employee.name.last_
     */
    addChangeListener(callback, options = { once: false }) {
        const callbackKey = this._getCallbackKey(callback);
        this._callbacks[callbackKey] = callback;
        if (options) {
            if (options.once) {
                this._toRemove.add(callbackKey);
            }
            if (options.condition) {
                this._predicates[callbackKey] = options.condition;
            }
        }
    }
    /** Removes the provided callback from the change listeners */
    removeChangeListener(callback) {
        const callbackKey = this._getCallbackKey(callback);
        delete this._callbacks[callbackKey];
    }
    /** Removes all change listeners */
    clearListeners() {
        for (var prop in this._callbacks) {
            delete this._callbacks[prop];
        }
    }
}
exports.default = Watchable;
