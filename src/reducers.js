// @flow
import { combineReducers } from 'redux';

import { CACHE_SET, BEGIN_REQUEST, END_REQUEST, ERROR_REQUEST } from './action-types';

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
    case BEGIN_REQUEST:
      return { ...state, [key]: payload };
    case END_REQUEST: {
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
    case CACHE_SET:
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
    case ERROR_REQUEST:
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
