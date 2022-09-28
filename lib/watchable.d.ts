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
declare type WatchableCallback<T> = (changeEvent?: ChangeEvent<T>) => void;
declare type PredicateFunction<T> = (changeEvent?: ChangeEvent<T>) => boolean;
/** Makes any **type T** "watchable" by providing the ability to add value change listeners.
 *
 * Use the value property to access the wrapped type T */
export default class Watchable<T> {
    private _proxy;
    private _callbacks;
    private _toRemove;
    private _predicates;
    private _oldValue;
    constructor();
    get value(): T | undefined;
    set value(x: T | undefined);
    private _deepProxy;
    private _createProxy;
    private _getNestedValue;
    private _getCallbackKey;
    private _runCallbacks;
    /** If predicateFn returns true now, immediately invokes the callback,
     * otherwise it's syntactic sugar for addChangeListener with options.once = true and options.condition.predicate = predicateFn.
     * @abstract **Use this like a Promise to avoid race conditions***/
    when(predicateFn: PredicateFunction<T>, callback: WatchableCallback<T>): void;
    /** If predicateFn returns true now, immediately invokes the callback,
     * otherwise it's syntactic sugar for addChangeListener with options = { once: true, condition:
     * { propertyPath: propertyPath, predicate: predicateFn } }
     * @propertyPath Can use . notation for nested properties. _E.g. employee.name.last looks up this.value.employee.name.last_
     * @abstract **Use this like a Promise to avoid race conditions**
     */
    when(propertyPath: string, predicateFn: PredicateFunction<T>, callback: WatchableCallback<T>): void;
    /** Adds the provided callback to the change listeners
     * @options once: if true, callback is removed after its first trigger
     * @options condition: if provided, the callback will only trigger if condition.predicate returns true
     * @options condition.propertyPath: a string matching the . notation lookup of a (nested) property. May provide if T is an object. Populates the condition.predicate function's
     * ChangeEvent parameter's "res" property with the resolution of the path (if there is one). _E.g. employee.name.last looks up this.value.employee.name.last_
     */
    addChangeListener(callback: WatchableCallback<T>, options?: WatchOptions<T>): void;
    /** Removes the provided callback from the change listeners */
    removeChangeListener(callback: WatchableCallback<T>): void;
    /** Removes all change listeners */
    clearListeners(): void;
}
export {};
