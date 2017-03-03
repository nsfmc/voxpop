# Thunk Decorating

A common pattern for dealing with apis using redux (or anything really) is something like this:

```javascript
const getId = (id: string, dispatch: Dispatcher): Promise<boolean> => {
  const apiPath = `api/path/${id}`;
  const timestamp = new Date().getTime();

  dispatch({type: BEGIN_FETCHING_ENTITY, meta: {key: apiPath}});

  return axios.get(apiPath).then(payload => {
    dispatch({type: RECEIVE_ENTITY, payload, meta: {key: apiPath, timestamp}});
    return true;
  },
  error => {
    dispatch({type: ERROR_IN_FETCH, meta: {key: apiPath}, error});
    throw new Error(error); //optional depending how you roll
  })
}
```

this is pretty good, you get to track your request lifecycle with some standard-ish actions.
everyone does this, it's great. it's a good pattern! when you use it, at the end of your promise
you _know_ that the data you care about is in your store, so you just need to dispatch one more
action to deal with the data now at your disposal:

```javascript
// get some id from our bag of ids
const idSelector = (state, id) => state.ids[id];

// action to do something with an id in our store
const useId = (idObject) => ({
  type: DO_SOMETHING,
  payload: idObject,
});

getId('foo', dispatch).then(() => {
  const fooId = idSelector(getState(), 'foo')
  dispatch(useId(fooId));
})
```

the details of how _your_ reducer responds to the fetch-begin/end/error lifecycle is up to you—it
could be a store-wide thing or it could be an action type specific to the entity. you decide.

## Caching

So you're fetching your data, but now you'd like a way to short-circuit your slowwww api-call if
your last request happened within some recently short window (a _ttl_).

if you're using redux-thunk, this is kinda of baked in because each thunk gets access to both a
`dispatch` and a `getState` call, so you could, before you actually dispatch your api call, do
a quick check to see if your data is fresh enough and just return immediately.

To do this, you'd extend your `getId` call to consume not just the `id` but also a `ttl` _for freshness_
and then "hide" those values in the closure created when you return the thunk you eventually dispatch.

```javascript
const getId = (id: string, ttl: number): Thunk => (
  (dispatch, getState): Promise<boolean> => {
    const apiPath = `api/path/${id}`;
    const timestamp = new Date().getTime();

    dispatch({type: BEGIN_FETCHING_ENTITY, meta: {key: apiPath}});
    const {[apiPath]: cache = {}} = getState().entities;
    if (new Date().getTime() - cache.timestamp < ttl) {
      return Promise.resolve();
    }

    return axios.get(apiPath).then(payload => {
      dispatch({type: RECEIVE_ENTITY, payload, meta: {key: apiPath, timestamp}});
      return;
    },
    error => {
      dispatch({type: ERROR_IN_FETCH, meta: {key: apiPath}, error});
      throw new Error(error); //optional depending how you roll
    })
  }
);
```

This is nicer, we now have something we can call like

```diff
 // get some id from our bag of ids
 const idSelector = (state, id) => state.ids[id];

-// action to do something with an id in our store
-const useId = (idObject) => ({
+// action thunk to do something with an id in our store
+const useId = (someId) => (dispatch, getState) => {
+  const idObject = idSelector(getState(), someId);
   return {
     type: DO_SOMETHING,
     payload: idObject,
   };
 +};

 // dispatch the api call, then dispatch the action using value in our store
-getId('foo', dispatch).then(() => {
-  const fooId = idSelector(getState(), 'foo')
-  dispatch(useId(fooId));
+dispatch(getId('foo', 1200)).then(() => {
+  return dispatch(useId('foo'))
 });
```

Now, the `useId(id: string)` function takes care of gathering the `id` object and doing
something with it, so turning it into a thunk has made our day-to-day code less complex

Still, the awkward thing is that `getId` has lots of _other_ logic baked into it, logic
that is not really about getting the `id` and more about the lifecycle of the request.

> there is only **one line of api call** but 18 others to deal with the request lifecycle

So the question is: can we extract the key/cache behavior somehow so that we can still
get the same benefits of inspecting a request lifecycle but don't need to create massive
_bespoke-thunks_ just to `GET` data day-to-day?

And (surprise) the answer is "Yes", and we can do it by using decorators. I won't assume
you're using the semi-supported decorator syntax, instead i'll show what i mean using
lodash's `_.flow` ([docs](https://lodash.com/docs/#flow)) which you can use to emulate decorators.

The syntax ends up looking like this:

```javascript
// the nature of decorating this axios call results in a function tha accepts three
// arguments instead of the original one in the axios call we wrap.
type WrappedGetId = (dispatch: Dispatch, getState: State, id: string) => Promise<boolean>;

const getId: WappedGetId = _.flow([
  key(id => `getId-${id}`),
  cached({ttl: 1200})
])(id => axios.get(`api/path${id}`))

// vanilla thunk pattern here
const getIdThunk = id => (dispatch, getState) => getId(dispatch, getState, id);

// get some id from our bag of ids
const idSelector = (state, id) => state.ids[id];

// action thunk to do something with an id in our store
const useId = (someId) => (dispatch, getState) => {
  const idObject = idSelector(getState(), someId);
  return {
    type: DO_SOMETHING,
    payload: idObject,
  };
});

dispatch(getIdThunk('foo').then(() => dispatch(useId('foo'));
```

couple nice things about this approach: if `getId` is used commonly, everyone that calls that api
will get free caching/etc because the implementation is shared. If somebody does want to do a one-off,
it is not hard to extract the meaningful call to `axios` because there is only _one line of actual api
calling code._

Notice, however, that as a result of the `_.flow` call, the original function now has both `dispatch`
and `getState` prepended (in order to allow the cached function to inspect the store).

you can then simplify that manual thunk creation step by decorating with one more function:
a `_.partialRight` to hide `dispatch` and `getState` from the invocation but to
return them as function params anyway.

```diff
type GetIdThunk = (id: string) => (dispatch: Dispatch, getState: State) => Promise<boolean>
+const getIdThunk: GetIdThunk = (...params) => _.flow([
-const getId: WappedGetId = _.flow([
   key(id => `getId-${id}`),
   cached({ttl: 1200}),
+  func => _.partialRight(func, ...params)
 ])(id => axios.got(`api/path${id}`))

-const getIdThunk = id => (dispatch, getState) => getId(dispatch, getState, id);

dispatch(getIdThunk('foo').then(() => dispatch(useId('foo'));
```

the syntax looks a bit wordy, and this is a case where decorators can't arrive soon enough,
but the payoff is that you abstract and unify all your caching (and additionally, fetch lifecycle
actions all in separate composed functions that adhere to their own domain logic.

finally, i can't claim very much credit for this other than to say that i adapted it for a
redux-thunk context. the initial implementation i cribbed from did many of these things in a more
hostile environment and was mostly conceived of by danny bowman @dbow1234.

attached to this gist are the implementation for both `key` and `cached` along with some jest tests to see how
they might get used in practice.
