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
    private _callbacks: Set<WatchableCallback<T>> = new Set<
        WatchableCallback<T>
    >();
    private _toRemove = new Set<Function>();
    private _predicates: Map<Function, PredicateData<T>> = new Map<
        Function,
        PredicateData<T>
    >();
    private _oldValue: any;

    constructor();
    /** @param initialValue Establishes type T and provides and initializes this.value */
    constructor(initialValue: T);
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

    private readonly propRegEx =
        /(?:(\w+)$)|(?:(\w+)(?=\.|\[))|(?:\[["]([^"]*)["]])|(?:\[[']([^']*)[']])/gm;

    private _getNestedValue(path: string) {
        let value: any = this.value;
        let obj = this._proxy;
        const keys: string[] = [];

        for (const match of path.matchAll(this.propRegEx)) {
            keys.push(match.slice(1).find((v: string) => v)!);
        }

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

    private _runCallbacks(e: ChangeEvent<T>) {
        for (let callback of this._callbacks) {
            let execute = true;

            const condition = this._predicates.get(callback);

            if (condition) {
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

                if (this._toRemove.delete(callback)) {
                    this.removeChangeListener(callback);
                }
            }
        }
    }

    /** Returns a void promise that resolves when the provided predicateFn returns true */
    promiseWhen(predicateFn: PredicateFunction<T>): Promise<void>;
    /** Returns a void promise that resolves when this.value === value */
    promiseWhen(value: T): Promise<void>;
    /** Returns a void promise that resolves when the provided property === value */
    promiseWhen(propertyPath: string, value: any): Promise<void>;
    promiseWhen(predicateValueOrProp: any, value?: any): Promise<void> {
        if (value) {
            return new Promise<void>((res) => {
                this.when(predicateValueOrProp, value, () => {
                    res();
                });
            });
        } else {
            return new Promise<void>((res) => {
                this.when(predicateValueOrProp, () => {
                    res();
                });
            });
        }
    }

    /** If predicateFn returns true now, immediately invokes the callback,
     * otherwise it's syntactic sugar for addChangeListener with options.once = true and options.condition.predicate = predicateFn.
     * @abstract **Use this like a Promise to avoid race conditions***/
    when(
        predicateFn: PredicateFunction<T>,
        callback: WatchableCallback<T>
    ): void;
    /** If value === this.value, immediately invokes callback. Otherwise, sets up a one-time change listener with that predicate.
     * @abstract **Use this like a Promise to avoid race conditions***/
    when(value: T, callback: WatchableCallback<T>): void;
    /** If [propertyPath resolution] === this.value, immediately invokes callback. Otherwise, sets up a one-time change listener with that predicate.
     * @propertyPath Can use . notation for nested properties. _E.g. employee.name.last looks up this.value.employee.name.last_
     * @abstract **Use this like a Promise to avoid race conditions**
     */
    when(
        propertyPath: string,
        value: any,
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
        predicateValueOrProp: any,
        callbackValueOrPredicate?: any,
        callback?: WatchableCallback<T>
    ): void {
        if (
            predicateValueOrProp &&
            this.value &&
            callbackValueOrPredicate &&
            callback
        ) {
            if (typeof this.value !== "object") {
                throw "Cannot use this when() overload when Watchable is not wrapping an object type";
            }

            const [val, obj] = this._getNestedValue(predicateValueOrProp);
            const changeEvent: ChangeEvent<T> = {
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
                } else {
                    this.addChangeListener(callback, {
                        once: true,
                        condition: {
                            propertyPath: predicateValueOrProp,
                            predicate: callbackValueOrPredicate
                        }
                    });
                }
            } else {
                if (callbackValueOrPredicate === val) {
                    callback(changeEvent);
                } else {
                    this.addChangeListener(callback, {
                        once: true,
                        condition: {
                            propertyPath: predicateValueOrProp,
                            predicate: (e) =>
                                e?.res === callbackValueOrPredicate
                        }
                    });
                }
            }
        } else if (typeof predicateValueOrProp === "function") {
            const changeEvent: ChangeEvent<T> = {
                newValue: this.value,
                oldValue: this._oldValue,
                root: this.value
            };

            if (predicateValueOrProp(changeEvent)) {
                callbackValueOrPredicate(changeEvent);
            } else {
                this.addChangeListener(callbackValueOrPredicate, {
                    once: true,
                    condition: {
                        predicate: predicateValueOrProp
                    }
                });
            }
        } else {
            const changeEvent: ChangeEvent<T> = {
                newValue: this.value,
                oldValue: this._oldValue,
                root: this.value
            };

            if (predicateValueOrProp === this.value) {
                callbackValueOrPredicate(changeEvent);
            } else {
                this.addChangeListener(callbackValueOrPredicate, {
                    once: true,
                    condition: {
                        predicate: (x) => x?.newValue === predicateValueOrProp
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
        this._callbacks.add(callback);

        if (options) {
            if (options.once) {
                this._toRemove.add(callback);
            }
            if (options.condition) {
                this._predicates.set(callback, options.condition);
            }
        }
    }

    /** Removes the provided callback from the change listeners */
    removeChangeListener(callback: WatchableCallback<T>) {
        this._callbacks.delete(callback);
        this._toRemove.delete(callback);
        this._predicates.delete(callback);
    }

    /** Removes all change listeners */
    clearListeners() {
        this._callbacks.clear();
        this._toRemove.clear();
        this._predicates.clear();
    }
}
