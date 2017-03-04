// @flow

import { CACHE_SET, BEGIN_REQUEST, END_REQUEST, ERROR_REQUEST } from './action-types';

type FSA<T> = {
  type: string,
  payload: T,
};

export type PayloadActionCreator<T> = (payload: T) => FSA<T>;

type CacheAction = {
  type: string,
  payload: {
    key: string,
    timestamp: number,
  },
};
// types for internal action creators used to populate cache
export type CacheSetCreator = (key: string, timestamp: number) => CacheAction;
export const cacheSetAction = (key: string, timestamp: number) => ({
  type: CACHE_SET,
  payload: { key, timestamp },
});


// types used for @fetching decorator
type RequestCacheAction = {
  type: string,
  meta: {
    key: string,
  },
  payload?: Promise<void>,
  error?: Error,
};
// dispatched before a promise has been started
export type BeginRequestAction = (key: string, promise: Promise<void>) => RequestCacheAction;
export const beginAction: BeginRequestAction = (key, promise) => ({
  type: BEGIN_REQUEST,
  payload: promise,
  meta: { key },
});

// dispatched once a promise has resolved
export type EndRequestAction = (key: string) => RequestCacheAction;
export const endAction: EndRequestAction = key => ({
  type: END_REQUEST,
  meta: { key },
});

// dispatched on decorated errors
export type ErrorRequestAction = (key: string, error: Error) => RequestCacheAction;
export const errorAction: ErrorRequestAction = (key, error) => ({
  type: ERROR_REQUEST,
  meta: { key },
  error,
});
