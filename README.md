# WatchableJS

WatchableJS provides the Watchable class which uses Proxies behind the scenes to allow adding Event-like handlers to value changes of any type T. Simply create a new Watchable(T) and add listeners to execute provided callbacks on value changes. Or use the when() member function to invoke a callback only once, based on a predicate; either immediately if the predicate is already true, or the next time the value changes to make it true. The callback and predicate functions optionally take a ChangeEvent parameter which provides data on the change.

## Rationale

I wanted the ability to asynchronously await a value change on a js primitive in a very generic way from different scopes. I found I could do it with Promises or rjrx Observables but not without using multiple objects/symbols; I wanted a simpler syntax. Once I got started I got a bit carried away and decided to make it support object types as well.

## Installing

```bash
npm install watchablejs
```

---

## Properties

### Watchable.value

Access to the wrapped primitive/object.

## Methods

### Watchable.addChangeListener(callback, options)

Add a callback to Watchable.value or nested property changes.

-   callback takes an optional [changeEvent](#the-changeevent-parameter) parameter
-   options is an object with the shape:

    > { once: boolean; condition?: PredicateData<T>; }

    -   once: if true, the handler will be removed after its first invocation

    -   condition: an object with the shape:

        > { propertyPath: string; predicate: PredicateFunction; }

        -   propertyPath: for use with object types. A string mimicking the dot-notation lookup of a nested property. If this successfully resolves, the predicate's [changeEvent](#the-changeevent-parameter).res parameter is populated with its value.
        -   predicate: a predicate function which takes a [changeEvent](#the-changeevent-parameter) parameter and must return coerce a boolean indicating whether the callback should be invoked or not.

### Watchable.when(predicateFn, callback)

If predicateFn returns true, immediately invokes callback, otherwise adds a change listener with callback and options.once = true and options.condition.predicate = predicateFn.

### Watchable.when(propertyPath, predicateFn, callback)

Like the other overloads except predicateFn's changeEvent parameter will have its "res" property populated with the resolution of propertyPath. See the [example](#using-whenpropertypath-predicatefn-callback).

### Watchable.removeChangeListener(callback)

Removes the callback from the instances change listeners. Note, unnamed callbacks (such as arrow functions not given a symbol) are converted to strings via toString() for storage and lookup in the internal callbacks object. Therefore, passing the exact same arrow function should remove it. However, if removal is planned, a named function should be used for adding/removing listeners.

### Watchable.clearListeners()

Removes all change listeners from the instance.

---

### The changeEvent parameter

Both callback and predicate functions optionally take a single ChangeEvent object parameter which provides data on the change.

```TS
interface ChangeEvent<T> {
    newValue: any;
    oldValue: any;
    root: T | undefined;
    target?: any;
    property?: string;
    res?: any;
}
```

#### newValue

##### If T is a primitive, its new value. If T is a complex type, this is a new property value, however deeply nested.

```TS
const count = new Watchable(1);
count.addChangeListener(e => { console.log(e.newValue); });
count.value++; // logs: 2
count.value += 100; // logs: 102

const foods = new Watchable({
    dairy: ["cheese", "milk", "yogurt"],
    grains: ["oats", "wheat", "barley", "popcorn"]
});

foods.addChangeListener(e => { console.log(`${e.property}: ${e.newValue}`); } );
foods.value.grains.push("corn"); // logs: "4: corn"
```

#### oldValue

##### If T is a primitive, its previous value. If T is a complex type, the previous value of a changed property, however deeply nested. _If the property/value is a complex type, then oldValue === newValue because newValue/oldValue are shallow copies. Also, if the property didn't already exists (such as a new array index), oldValue will be undefined._

#### target

##### The object whose property changed. Undefined for primitives.

#### root

##### Alias for the Watchable.value property

#### property

##### The property that got changed

#### res

##### The resolution of the propertyPath string if one was provided via a paired predicateFn, else undefined

---

## Examples

The value of whatever type the Watchable was initialized with is accessed through the value parameter:

```TS
// Primitive
const myWatchable = new Watchable("hello");
console.log(myWatchable.value); // logs: "hello"
// Object
const watchableObj = new Watchable({ message: "hi" });
console.log(watchableObj.value.message); // logs: "hi"
```

### using addChangeListener()

```TS
const message = new Watchable("hello");
message.addChangeListener(e => { console.log(e.newValue); });
message.value = "goodbye"; // logs: "goodbye"
```

### Using when(predicateFn, callback)

```TS
const setupComplete = new Watchable(false);
setupComplete.when(e => e.newValue, () => { console.log("setup has completed"); })
setupComplete.value = true; // logs: "setup has completed"
```

If predicateFn already coerces to true, the callback will fire immediately. Therefore, Watchable.when() a great way to avoid race conditions:

```TS
const setupComplete = new Watchable(true);
setupComplete.when(e => e.newValue, () => { console.log("setup has completed"); }) // logs: "setup has completed"
```

### Using when(propertyPath, predicateFn, callback)

You may provide a string resolvable (via . notation) to a nested property (if T is an object) to have changeEvent.res set to that property's value:

```TS
const person = new Watchable({
  name: "Blake",
  qualities: {
      titles: ["Farmer", "Application Programmer II"],
      interests: ["programming", "farming"],
      phenotype: {
          hair: "red",
          eyes: "blue",
      }
  }
});
person.when(
    "qualities.interests.length",
    e => e.res >= 5, // condition is met when qualities.interests.length >= 5
    (e) => {
        console.log(`${e.root.name} has quite a few interests,
         including ${e.target.join(", ")}`)
    }
);
person.value.qualities.interests.push("reading");
person.value.qualities.interests.push("hiking");
person.value.qualities.interests.push("meditation");
// logs: "Blake has quite a few interests, including programming, farming, reading, hiking and meditation"
```