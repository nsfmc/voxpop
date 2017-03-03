import flow from 'lodash/flow';

import { key } from '../decorators';


describe('key', () => {
  test('adds a key to a function', () => {
    const testFunc = flow(
      [key(() => 'keyval')])(jest.fn());
    expect(testFunc.KEY).toBeDefined();
  });

  test('key function returns correct value', () => {
    const testFunc = flow([key(() => 'keyval')])(jest.fn());
    expect(testFunc.KEY()).toEqual('keyval');
  });
});
