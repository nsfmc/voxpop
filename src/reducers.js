// @flow
import { combineReducers } from 'redux';

type Reducer<S, A> = (state: S, action: A) => S;

type RequestState = {
  [key: string]: {
    inflight?: any,
    errors?: any,
  },
};

type RequestAction = {
  type: string,
  payload: Promise<void>,
  meta: {
    key: string
  },
  error: any,
};

export const fetchingReducer: Reducer<RequestState, RequestAction> = (state = {}, action) => {
  const { type, payload, meta: { key } } = action;

  switch (type) {
    case '@@voxpop/request-begin':
      return { ...state, [key]: payload };
    case '@@voxpop/request-end': {
      const { [key]: unused, ...rest } = state; // eslint-disable-line no-unused-vars
      return rest;
    }
    default:
      return state;
  }
};

type CacheState = {
  [key: string]: number,
}

type CacheAction = {
  type: string,
  payload: {
    key: string,
    timestamp: number,
  },
};

export const cacheReducer: Reducer<CacheState, CacheAction> = (state = {}, action) => {
  const { type, payload: { key, timestamp } } = action;

  switch (type) {
    case '@@voxpop/cache-set':
      return { ...state, [key]: timestamp };
    default:
      return state;
  }
};


type ErrorState = {
  [key: string]: Error,
}

type ErrorAction = {
  type: string,
  error: Error,
  meta: {
    key: string,
  }
};

export const errorReducer: Reducer<ErrorState, ErrorAction> = (state = {}, action) => {
  const { type, error, meta: { key } } = action;
  switch (type) {
    case '@@voxpop/request-error':
      return { ...state, [key]: error };
    default:
      return state;
  }
};


export default combineReducers({
  error: errorReducer,
  cache: cacheReducer,
  fetching: fetchingReducer,
});
