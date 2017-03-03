import flow from 'lodash/flow';
import partialRight from 'lodash/partialRight';

import { key, cached } from '../decorators';


describe('cached', () => {
  let dispatch;
  let getState;
  let state;
  let props;
  let getUserThunk;
  let receive;
  let cacheSet;
  let dummyApiCall;

  beforeEach(() => {
    dispatch = jest.fn();
    state = { cache: { foo: {} } };

    receive = jest.fn();
    cacheSet = jest.fn();
    dummyApiCall = jest.fn(() => Promise.resolve());
    getState = () => state;
    props = { dispatch: thunk => thunk(dispatch, getState) };

    const cachedFunc = flow([
      key(arg => `getUser-${arg}`),
      cached(receive, { ttl: 100, cacheSet }),
    ])(someApiArg => Promise.resolve(`hot: ${someApiArg}`));

    getUserThunk = userName => (d, gs) => (
      cachedFunc(d, gs, userName)
    );
  });

  test('it caches a keyed function with empty cache', () => {
    const cachedFunc = flow([
      key(() => 'foo'),
      cached(receive, { ttl: 100, cacheSet }),
    ])(() => Promise.resolve('hotdogs'));

    // we wouldn't typically invoke this way, instead we would use props.dispatch
    // but this is a good way to see what the result of cachedFunc is
    return cachedFunc(dispatch, getState).then(() => {
      expect(cacheSet).toHaveBeenCalledTimes(1);
      expect(receive).toHaveBeenCalledTimes(1);
    }).catch('err');
  });

  test('preserves the wrapped func\'s output', () => (
    props.dispatch(getUserThunk('doge')).then(() => {
      const [payload] = receive.mock.calls[0];
      expect(payload).toEqual('hot: doge');
    })
  ));

  test('uses key function to generate cache key', () => (
    props.dispatch(getUserThunk('doge')).then(() => {
      const [keyValue] = cacheSet.mock.calls[0];
      expect(keyValue).toEqual('getUser-doge');
    }).catch('err')
  ));

  test('returns immediately on fresh cache', () => {
    const cachedFunc = flow([
      key(() => 'baz'),
      cached(receive, { ttl: 1000, cacheSet }),
    ])(dummyApiCall);

    const { cache } = state;
    const when = new Date().getTime();
    state = { ...state, cache: { ...cache, baz: { value: 'doges', timestamp: when } } };

    return cachedFunc(dispatch, getState).then((res) => {
      expect(cacheSet).toHaveBeenCalledTimes(0);
      expect(receive).toHaveBeenCalledTimes(0);
      expect(dummyApiCall).toHaveBeenCalledTimes(0);
      expect(res).toBeUndefined();
    });
  });

  test('calls api on stale cache', () => {
    dummyApiCall = jest.fn(() => Promise.resolve('hotdogs'));

    const cachedFunc = flow([
      key(() => 'baz'),
      cached(receive, { ttl: 0, cacheSet }),
    ])(dummyApiCall);

    const { cache } = state;
    const when = new Date().getTime() - 1000;
    state = { ...state, cache: { ...cache, baz: { value: 'doges', timestamp: when } } };

    return cachedFunc(dispatch, getState).then((res) => {
      expect(cacheSet).toHaveBeenCalledTimes(1); // dispatches cacheSet
      expect(dummyApiCall).toHaveBeenCalledTimes(1); // calls the api call
      expect(receive).toHaveBeenCalledTimes(1); // data is saved somehow
      expect(res).toBeUndefined();
    });
  });

  // This is a sort of superfluous test just to show how you might invoke
  // the function this way.
  test('can make thunks with _.partialRight()', () => {
    const getFoo = (...args) => flow([
      key((a, b, c) => `${c}${b}${a}`),
      cached(receive, { ttl: 1200, cacheSet }),
      func => partialRight(func, ...args),
    ])(dummyApiCall);

    return props.dispatch(getFoo('foo', 'bar', 'baz')).then(() => {
      const [keyValue] = cacheSet.mock.calls[0];
      const dummyApiArgs = dummyApiCall.mock.calls[0];

      expect(keyValue).toEqual('bazbarfoo');
      expect(dummyApiArgs).toEqual(['foo', 'bar', 'baz']);
    });
  });
});
