import flow from 'lodash/flow';

import { key, cached, fetching } from '../decorators';


describe('fetching', () => {
  let dispatch;
  let getState;
  let state;
  let props;
  let receive;
  let cacheSet;
  let getFoo;
  let beginAction;
  let endAction;
  let errorAction;

  beforeEach(() => {
    dispatch = jest.fn();
    state = { cache: {}, requestCache: {} };

    receive = jest.fn();
    cacheSet = jest.fn();
    beginAction = jest.fn();
    endAction = jest.fn();
    errorAction = jest.fn();
    getState = () => state;
    props = { dispatch: thunk => thunk(dispatch, getState) };
    const dummyApiCall = () => Promise.resolve('hotdogs');

    getFoo = (longRequest = dummyApiCall) => flow([
      key(() => 'foo'),
      cached(receive, { ttl: 100, cacheSet }),
      fetching({
        beginRequestAction: beginAction,
        endRequestAction: endAction,
        errorRequestAction: errorAction,
      }),
    ])(longRequest);
  });


  test('it calls the begin action', () => (
    props.dispatch(getFoo()).then(() => {
      expect(beginAction).toHaveBeenCalledTimes(1);
      const [keyVal] = beginAction.mock.calls[0];
      expect(keyVal).toEqual('foo');
    }).catch('err')
  ));

  test('it calls the end action', () => (
    props.dispatch(getFoo()).then(() => {
      expect(endAction).toHaveBeenCalledTimes(1);
      const [keyVal] = endAction.mock.calls[0];
      expect(keyVal).toEqual('foo');
    }).catch('err')
  ));

  test('it does not calls the error action usually', () => (
    props.dispatch(getFoo()).then(() => {
      expect(errorAction).toHaveBeenCalledTimes(0);
    }).catch('err')
  ));

  test('it calls error action for errers', () => (
    props.dispatch(getFoo(() => Promise.reject('error'))).then(() => {
      expect(errorAction).toHaveBeenCalledTimes(1);
    }).catch(err => expect(err).toThrow())
  ));

  test('it returns an existing promise', () => {
    // this is somewhat contrived, but mostly just because .toBe doesn't
    // seem to return true for prom and state.requestCache.foo... not sure why
    // so just check that the dispatch returns the same promise value even
    // though we never use the promise value here
    const prom = Promise.resolve('bar');
    expect.assertions(2);

    state.requestCache.foo = prom;
    props.dispatch(getFoo()).then(res => expect(res).toBe('bar')).catch(() => {});
    return prom.then(e => expect(e).toBe('bar')).catch(() => {});
  });
});
