interface ChangeEvent<T> {
    newValue: any;
    oldValue: any;
    root: T | undefined;
    target?: any;
    property?: string;
    res?: any;
}

interface PredicateData<T> {
    propertyPath?: string;
    predicate: PredicateFunction<T>;
}

interface WatchOptions<T> {
    once: boolean;
    condition?: PredicateData<T>;
}

type WatchableCallback<T> = (changeEvent?: ChangeEvent<T>) => void;
type PredicateFunction<T> = (changeEvent?: ChangeEvent<T>) => boolean;

/** Makes any **type T** "watchable" by providing the ability to add value change listeners.
 *
 * Use the value property to access the wrapped type T */
export default class Watchable<T> {
    private _proxy: { value: T };
    private _callbacks: Record<string, WatchableCallback<T>> = {};
    private _toRemove = new Set<string>();
    private _predicates: Record<string, PredicateData<T>> = {};
    private _oldValue: any;

    constructor();
    /** @param initialValue Establishes type T and provides and initializes this.value */
    constructor(initialValue: T)
    constructor(initialValue?: T) {
        this._proxy = this._deepProxy({ value: initialValue });
    }

    get value() {
        return this._proxy.value;
    }

    set value(x) {
        this._oldValue = this.value;

        if (x && typeof x === "object") {
            this._proxy.value = this._deepProxy(x);
        } else {
            this._proxy.value = x;
        }
    }

    private _deepProxy(obj: any) {
        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === "object") {
                obj[key] = this._deepProxy(value);
            }
        }

        return this._createProxy(obj);
    }

    private _createProxy(obj: any) {
        return new Proxy(obj, {
            set: (t, p, v) => {
                const oldValue = (this._oldValue = t[p]);
                if (oldValue === v) return true;
                if (v && typeof v === "object") t[p] = this._deepProxy(v);
                else t[p] = v;
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

    private _getNestedValue(path: string) {
        let value: any = this.value;
        let obj = this._proxy;
        const keys = path.split(".");
        try {
            for (const key of keys) {
                if (value && typeof value === "object") obj = value;
                value = value[key];
            }
        } catch (error) {
            console.error(error);
            value = undefined;
        }
        return [value, obj];
    }

    private _getCallbackKey(callback: WatchableCallback<T>) {
        return callback.name ? callback.name : callback.toString();
    }

    private _runCallbacks(e: ChangeEvent<T>) {
        for (let callback of Object.values(this._callbacks)) {
            let execute = true;
            const callbackKey = this._getCallbackKey(callback);

            if (callbackKey in this._predicates) {
                const condition = this._predicates[callbackKey];

                if (
                    condition.propertyPath &&
                    typeof this.value === "object" &&
                    this.value
                ) {
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

    /** If predicateFn returns true now, immediately invokes the callback,
     * otherwise it's syntactic sugar for addChangeListener with options.once = true and options.condition.predicate = predicateFn.
     * @abstract **Use this like a Promise to avoid race conditions***/
    when(
        predicateFn: PredicateFunction<T>,
        callback: WatchableCallback<T>
    ): void;
    /** If predicateFn returns true now, immediately invokes the callback,
     * otherwise it's syntactic sugar for addChangeListener with options = { once: true, condition:
     * { propertyPath: propertyPath, predicate: predicateFn } }
     * @propertyPath Can use . notation for nested properties. _E.g. employee.name.last looks up this.value.employee.name.last_
     * @abstract **Use this like a Promise to avoid race conditions**
     */
    when(
        propertyPath: string,
        predicateFn: PredicateFunction<T>,
        callback: WatchableCallback<T>
    ): void;
    when(
        predicateOrProp: any,
        callbackOrPredicate?: any,
        callback?: WatchableCallback<T>
    ): void {
        if (
            predicateOrProp &&
            typeof this.value === "object" &&
            this.value &&
            callbackOrPredicate &&
            callback
        ) {
            const [val, obj] = this._getNestedValue(predicateOrProp);
            const changeEvent: ChangeEvent<T> = {
                newValue: val,
                oldValue: this._oldValue,
                property: predicateOrProp.split(".").at(-1),
                root: this.value,
                target: obj,
                res: val
            };

            if (callbackOrPredicate(changeEvent)) {
                callback(changeEvent);
            } else {
                this.addChangeListener(callback, {
                    once: true,
                    condition: {
                        propertyPath: predicateOrProp,
                        predicate: callbackOrPredicate
                    }
                });
            }
        } else {
            const changeEvent: ChangeEvent<T> = {
                newValue: this.value,
                oldValue: this._oldValue,
                root: this.value
            };

            if (predicateOrProp(changeEvent)) {
                callbackOrPredicate(changeEvent);
            } else {
                this.addChangeListener(callbackOrPredicate, {
                    once: true,
                    condition: {
                        predicate: predicateOrProp
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
    addChangeListener(
        callback: WatchableCallback<T>,
        options: WatchOptions<T> = { once: false }
    ) {
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
    removeChangeListener(callback: WatchableCallback<T>) {
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
