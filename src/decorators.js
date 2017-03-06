// @flow
import get from 'lodash/get';

import {
  cacheSetAction,

  beginAction,
  endAction,
  errorAction,
} from './action-creators';
import type {
  PayloadActionCreator,
  CacheSetCreator,

  BeginRequestAction,
  EndRequestAction,
  ErrorRequestAction,
} from './action-creators';

type ReduxState = {[key: string]: {}};

/**
 * Attaches a key-returning function to the given function. The key is used by
 * the cached and fetching decorators, and must be added *before* them.
 */
export function key<Function>(keyFn: Function): (f: Function) => Function {
  return (wrappedFunc: Function): Function => {
    const reWrapped = (...args) => wrappedFunc.apply(this, args);
    reWrapped.KEY = keyFn;
    return wrappedFunc;
  };
}


/**
 * evaluates whether a Date.getTime() is older than a ttl
 */
const expired = (time: number, ttl: number): boolean => {
  if (time) {
    const now = new Date().getTime();
    return (now - time) > ttl;
  }
  return true;
};


/**
 * Cache a promise-returning function.
 *
 * Handles resolving action calls that are already cached, and caching the
 * results of ones that aren't. Only works for promises
 */

type TTLSelector = (state: ReduxState, key: string) => number;
type CacheOpts = {
  ttl: number,
  cacheSet: CacheSetCreator,
  ttlSelector: TTLSelector,
};

// These are defaults (i can't see why we would change them)
const cacheTtlSelector = (state, keyVal) => get(state, ['cache', keyVal, 'timestamp'], 0);

// This type is a bit confusing because decorators, but it returns
// (funcToWrap: (...args: any[]) => Promise<T>) => (dispatch, getState, ...args) => Promise<T>
export function cached(receive: PayloadActionCreator<*>, {
    ttl = 60000,
    cacheSet = cacheSetAction,
    ttlSelector = cacheTtlSelector,
  }: CacheOpts): Function {
  return (wrappedFunc: (...args: any[]) => Promise<*>) => {
    if (!wrappedFunc.KEY) {
      throw new Error('Must use key() decorator first before cached');
    }
    return key(wrappedFunc.KEY)((dispatch, getState, ...restArgs) => (
      new Promise((resolve, reject) => {
        const keyVal = wrappedFunc.KEY.apply(this, restArgs);
        if (!expired(ttlSelector(getState(), keyVal), ttl)) {
          resolve();
        } else {
          wrappedFunc.apply(this, restArgs)
            .then((result) => {
              dispatch(receive(result));
              dispatch(cacheSet(keyVal, new Date().getTime()));
              resolve();
            }).catch(error => reject(error));
        }
      })));
  };
}


type FetchingOpts = {
  inflightSelector: (state: Object) => ?Promise<void>,
  beginRequestAction: BeginRequestAction,
  endRequestAction: EndRequestAction,
  errorRequestAction: ErrorRequestAction,
};
const selectInflight = (state, keyValue) => get(state, ['requestCache', keyValue, 'inflight']);
/**
 * Batch an action and dispatch any errors
 *
 * Handles preventing multiple concurrent calls to the same action by resolving
 * subsequent calls with the existing request promise.
 * Dispatches any errors to the so components can react to them.
 */
export function fetching({
  inflightSelector = selectInflight,
  beginRequestAction = beginAction,
  endRequestAction = endAction,
  errorRequestAction = errorAction,
}: FetchingOpts): Function {
  return (func: (...args: any[]) => Promise<void>): Function => {
    if (!func.KEY) {
      throw new Error('Must use key() decorator first before fetching');
    }
    return key(func.KEY)((dispatch, getState, ...args) => new Promise((resolve, reject) => {
      const keyValue = func.KEY.apply(this, args);

      const inflightRequest = inflightSelector(getState(), keyValue);
      if (inflightRequest) {
        resolve(inflightRequest);
      } else {
        const request = func.apply(this, [dispatch, getState].concat(args));
        dispatch(beginRequestAction(keyValue, request));

        request.then((result) => {
          dispatch(endRequestAction(keyValue));
          resolve(result);
        }).catch((error) => {
          dispatch(errorRequestAction(keyValue, error));
          reject(error);
        });
      }
    }));
  };
}
