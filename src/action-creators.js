// @flow

type CacheAction = {
  type: string,
  payload: {
    key: string,
    timestamp: number,
  },
};

type FSA<T> = {
  type: string,
  payload: T,
};
export type PayloadActionCreator<T> = (payload: T) => FSA<T>;

// types for internal action creators used to populate cache
export type CacheSetCreator = (key: string, timestamp: number) => CacheAction;

export const cacheSetAction = (key: string, timestamp: number) => ({
  type: '@@voxpop/cache-set',
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
  type: '@@voxpop/request-begin',
  payload: promise,
  meta: { key },
});

// dispatched once a promise has resolved
export type EndRequestAction = (key: string) => RequestCacheAction;
export const endAction: EndRequestAction = key => ({
  type: '@@voxpop/request-end',
  meta: { key },
});

// dispatched on decorated errors
export type ErrorRequestAction = (key: string, error: Error) => RequestCacheAction;
export const errorAction: ErrorRequestAction = (key, error) => ({
  type: '@@voxpop/request-error',
  meta: { key },
  error,
});
