## What is going on here?

by decorating our actual function call you gain not only the ability to factor out concerns from your code, you also get to opt-in to behavior if you need it.

First, how does key work and how does it intercept `getId()`'s arguments?

### key

in order to understand, we need to break out of the `_.flow` syntax:

```javascript
const keyedFunc = _.flow([key()])(func)
keyedFunc(arg) === key()(func)(arg)
```

this means `key` is a function, that when executed, returns a _brand new function_ that consumes a function. But critically, what you notice is that `arg` is available to both `key` and to `func` depending on how we construct `key`.

in our case, we just attach the first argument of `key` to the function we wrap, the implementation is very straightforward:

```javascript
const key = (keyGen) => (funcToWrap) => {
  const wrapper = (...args) => funcToWrap.apply(this, args);
  wrapper.KEY = keyGen;
  return wrapper;
}
```

the modern ecmascript syntax can make that look a little ouroboros-like, so instead we might write:

```js
function key(keyGen) {
  return function keyedFunction(funcToWrap) {
    function wrapper() { return funcToWrap.apply(this, arguments); }
    wrapper.KEY = keyGen;
    return wrapper;
  }
}
```

the point being that `keyedFunction` has access to the arguments of the function we wrap, so we could do something cheeky like this (incepting two levels):

```js
function keyLog(keyGen) {
  return function keyedFunction(funcToWrap) {
    funcToWrap.KEY = keyGen;

    return function interceptingFunction(...args){
      const keyValue = funcToWrap.KEY(...args);
      console.log(keyValue);

      return funcToWrap.apply(this, args);
    }
  }
}


const intercepted = key(x => `keyLogger ${x}::${x}`)(logAndAdd)
intercepted(2,3);
// [Log] keyLogger: 2::2
// [Log] {a: 2, b: 3}
```

but we could also simplify this by just having a second decorator that knows _how_ to use the `.KEY` property of the wrapped function:

```js
function key(keyGen) {
  return function keyedFunction(funcToWrap) {
    function wrapper() { return funcToWrap.apply(this, arguments); }
    wrapper.KEY = keyGen;
    return wrapper;
  }
}

function keyConsoler(wrappedFunc) {
  return function reWrappedFunc(...args) {
    if (wrappedFunc.KEY != null) {
      const keyValue = wrappedFunc.KEY.apply(this, args);
      console.log(`keyConsoler: ${keyValue}`)
    }

    return wrappedFunc.apply(this, args);
  }
}

const composed = keyConsoler(key(x => `${x}~~${x}`)(logAndAdd))
composed(4,5)
// [Log] keyConsoler: 4~~4
// [Log] {a: 4, b: 5}
```

and here, again, what we've done is a common sort of refactor: we've moved the actual `console.log`ing-logic into `keyConsoler` and we've turned `key` into this function that only deals with returning a new function with a `KEY` property.

> Notice that these calls are performed _inside out_. first key is applied, then keyConsoler, and finally the resulting function receives the arguments 4 and 5.
>
> lodash's [`_.flow`](https://lodash.com/docs/#flow) function simplifies this and turns it into a more traditional decorator style, like so:

```js
_.flow([
  key(x => `${x}~~${x}`),
  keyConsoler
])(logAndAdd)(4,5)
```

Now that we have that in place, we can look at something like how `cached` should behave
