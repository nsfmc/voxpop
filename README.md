# VoxPop

![the segment image for Vox Populi, a portion of The Network News Hour starring Howard Beale from the movie Network (1976)](https://s3.amazonaws.com/images-generic-dot-cx/network-voxpopuli.png)

When dealing with apis and redux a common complaint is the amount of boilerplate required to be productive in _“The Redux Way”_. This is a side-effect of redux being very chatty by design. But it can also make the experience of using redux feel overly cumbersome: "why do i need to fire actions for every part of my request, why do i always need to create new actions for each endpoint, etc."

It's almost certain that you've come up with a solution for this in your codebase or maybe you use something like [redux-api-middleware](https://github.com/agraboso/redux-api-middleware). This should not be a hard or complicated problem, because what fundamentally exposes is two [intertwined](https://www.infoq.com/presentations/Simple-Made-Easy) concerns that should really be separate:

1. performing an asynchronous api call
1. tracking its lifecycle by dispatching many actions.
1. deduping calls with caching.
1. exposing the status of an existing request (is it _pending_, _resolved_, _errorful_?).

VoxPop is _not_ a library or general purpose module (although it is packaged as such for other reasons), it is really just a hyper-specific walkthrough of a network-related code refactor. It is implemented using decorators, but the critical idea is identifying overlapping concerns and extracting them into shared modules. Think of this readme as a sort of written-out talk you might hear at a meetup.


## The painpoint

A common redux pattern for dealing with apis is to use redux to dispatch lifecycle actions for api request, looking something like this:

```javascript
const getId = (id: string, dispatch: Dispatcher) => {
  const apiPath = `api/path/${id}`;

  dispatch({type: BEGIN_FETCHING_ENTITY, meta: {key: apiPath}});

  return axios.get(apiPath).then(payload => {
    dispatch({type: RECEIVE_ENTITY, payload, meta: {key: apiPath}});
    return true;
  }).catch(error => {
    dispatch({type: ERROR_IN_FETCH, meta: {key: apiPath}, error});
    throw new Error(error); //optional depending how you roll
  })
}
```

if you look at redux example code, you learn that apparently everyone does this and with good reason—it's great. it's a good pattern! Let's just walk over what it does:

1. constructs an api path
1. saves the time the request is initiated
1. dispatches a `BEGIN_FETCHING_ENTITY` action to let you know that your request is beginning
1. starts a network request (using axios, although it could be fetch or what have you).

    1. if the request succeeds:
        a. it dispatches another action to let a reducer consume the entity
        a. the promise resolves
        > we _don't_ need the promise to resolve with the payload value because multiple reducers may listen for `RECEIVE_ENTITY` and inspect the apiPath to decide whether or not to consume the payload).
        > secondly, immediately using the promise's payload violates redux's "one source of truth" approach which, say what you will about redux, at least it's an ethos.

  1. if the request fails, we dispatch an `ERROR_IN_FETCH` action and let the error pass through.

We do this with 11 lines of javascript, _only one_ of which actually hits our api.

But that's fine, because when we _actually_ use `getId`, our calls are (probably) pretty concise:

```javascript
const {dispatch, getState} = store;

getId('foo', dispatch).then(() => {
  const foo = getForId(getState(), 'foo')
  dispatch(useThing(foo));
})
```

Which looks pretty reasonable! Abstracted in `getId` is a whole set of lifecycle methods. the details of how _your_ reducer deals with the fetch-begin/end/error lifecycle is up to you—it could be a store-wide thing or it could be a set of actions specific to the entity. Maybe you don't even store them, you just listen for `RECEIVE_ENTITY` actions and look at the others for debugging. you decide.

> you may be thinking: _“this tastes an awful lot like `redux-thunk`”_ and _you would be right_, but it will be less confusing to talk about this without introducing thunks because they only provide syntactic sugar for more core concepts.


## What about caching?

So you're fetching your data and tracking its lifecycle, but now you'd like a way to short-circuit your slowwww api-call if your last request happened within some reasonably short window ([ttl](https://en.wikipedia.org/wiki/Time_to_live)).

So before you actually fire off your api call, you do a quick check to see if your data is fresh enough and instead just return immediately.

To do this, you'd extend your `getId` call to consume not just the `id` but also a `ttl` _for freshness_. Additionally, you'd need to keep track of _when_ each request is made in order to make the ttl useful store.

```diff
-const getId = (id, dispatch) => {
+const getId = (id, dispatch, getState, ttl) {
   const apiPath = `api/path/${id}`;
+  const timestamp = new Date().getTime();

+  // placed here, this action represents all calls to the getId
+  // but after the cache check will represent new network calls, your call
   dispatch({type: BEGIN_FETCHING_ENTITY, meta: {key: apiPath}});

+  const {[apiPath]: cached = {}} = getState().entities;

+  if (cached.timestamp && (timestamp - cached.timestamp) < ttl) {
+    dispatch({type: CACHE_HIT, meta: {key: apiPath}}); // optional, tbh
+    return Promise.resolve();
+  }

   return axios.get(apiPath).then(payload => {
-    dispatch({type: RECEIVE_ENTITY, payload, meta: {key: apiPath}});
+    dispatch({type: RECEIVE_ENTITY, payload, meta: {key: apiPath, timestamp}});
     return true;
   }).catch(error => {
     dispatch({type: ERROR_IN_FETCH, meta: {key: apiPath}, error});
     throw new Error(error); //optional depending how you roll
   })
 }
```

This is not that much worse than before and we now have something we can call like:

```diff
 const {dispatch, getState} = store;

+//cache for 2 seconds
+getId('foo', dispatch, 2000).then(() => {
-getId('foo', dispatch).then(() => {
   const foo = getForId(getState(), 'foo');
   dispatch(useThing(foo));
 })
```

Still, the awkward thing is that `getId` has lots of _other_ logic baked into it. logic that is not really about getting the `id` and more about the lifecycle of the request.

> there is only **one line of api call** but 18 others to deal with the request lifecycle

So the question is: can we extract the key/cache behavior somehow so that we can still get the same benefits of tracking a request's lifecycle but don't need to create massive _bespoke-thunks_ just to `GET` data from our api day-to-day?

And (surprise) the answer is "Yes", and here we will do it by using decorators. I won't assume you're using the semi-supported decorator syntax, instead i'll show it using lodash's `_.flow` ([docs](https://lodash.com/docs/#flow)) which you can use to emulate decorators.

## Our glorious future

To fast-forward: the syntax we end up creating looks like this:

```javascript
const getId = id => axios.get(`api/path${id}`);

// notice that cached has the only hard dependency on getState and dispatch
// so we can pass both into cached when creating it.
const cachedGetId = _.flow([
  key(id => `getId-${id}`),
  cached(dispatch, getState, {ttl: 1200}),
])(getId)

// and we can call it like this
cachedGetId(id).then(() => {
  const foo = getForId(getState(), 'foo');
  dispatch(useThing(foo));
})
```

couple nice things about this:
1. if `getId` is used commonly, everyone that calls that api
will get free caching/etc because the implementation is shared.
1. If somebody does want to do a one-off network call, it is _not_ hard to extract the meaningful call to `axios` because there is only _one line of actual api calling code._ and it's already a function, `getId`.

And looking at this, you realize that we've made an implicit assumption that our reducers know about actions emitted by `cached` (namely `RECEIVE_ENTITY`).

So let's instead separate that out as well:

```javascript
const getId = id => axios.get(`api/path${id}`);

const cachedGetId = _.flow([
  key(id => `getId-${id}`),
  cached(dispatch, getState, {ttl: 1200}),
  receive(idReceiveActionCreator),
])(getId)
```

and we could add other interesting calls as well, including one to track the state of the request and dedupe inflight requests

```javascript
const getId = id => axios.get(`api/path${id}`);

const cachedGetId = _.flow([
  key(id => `getId-${id}`),
  cached(dispatch, getState, {ttl: 1200}),
  fetching(dispatch, getState),
  receive(dispatch, idReceiveActionCreator),
])(getId)

getId('id').then(...)
```

you may look at this and realize that `cachedGetId` always needs to be defined in a context where `dispatch` and `getState` are available, meaning you can't keep it in a separate lib module. that's fine! change the call:

```javascript
const getId = id => axios.get(`api/path${id}`);

const cachedGetId = (dispatch, getState) => _.flow([
  key(id => `getId-${id}`),
  cached(dispatch, getState, {ttl: 1200}),
  fetching(dispatch, getState),
  receive(dispatch, idReceiveActionCreator),
])(getId)

getId(dispatch, getState)('id').then(...)
```
this is weird, but not _crazy_ weird.

alternatively you may be seeing thas and if you are using [`redux-thunk`](https://github.com/gaearon/redux-thunk), at this point you may wish to change the behavior of this to instead return a thunk so that you can pass `dispatch` and `setState` via redux-thunk's dispatch mechanism, like so:

```javascript
const getId = id => axios.get(`api/path${id}`);

const thunkedGetId = _.flow([
  key(id => `getId-${id}`),
  thunkify(), // this could also be implicit in cached, fetching, receive, etc
  cached({ttl: 1200}),
  fetching(),
  receive(idReceiveActionCreator),
])(getId)

dispatch(thunkedGetId('foo')).then(...)
```

both these are basically the same thing, they just change the nature of when and where you bind your dispatchers to your lifecycle requests. You should choose whatever works best for you!

### credits

the syntax looks a bit wordy, and this is a case where decorators can't arrive soon enough, but the payoff is that you abstract and unify all your caching (and additionally, fetch lifecycle actions all in separate composed functions that adhere to their own domain logic.

finally, i can't claim very much credit for this other than to say that i adapted it for a redux-thunk context. the initial implementation i cribbed from did many of these things in a more hostile environment and was mostly conceived of by danny bowman @dbow1234.

