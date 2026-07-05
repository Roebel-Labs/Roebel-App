import { reducer, initialState } from '../welcome-wizard-state';

describe('welcome wizard reducer', () => {
  it('stores the organisation role', () => {
    const next = reducer(initialState, { type: 'SET_ROLE', payload: 'organisation' });
    expect(next.preferredRole).toBe('organisation');
  });

  it('stores and clears citizen data', () => {
    const data = {
      firstName: 'Anna',
      lastName: 'Müller',
      birthdate: '1990-01-01',
      address: 'Musterstraße 1, 17207 Röbel',
    };
    const withData = reducer(initialState, { type: 'SET_CITIZEN_DATA', payload: data });
    expect(withData.citizenData).toEqual(data);
    const cleared = reducer(withData, { type: 'SET_CITIZEN_DATA', payload: null });
    expect(cleared.citizenData).toBeNull();
  });

  it('RESET drops citizen data', () => {
    const data = {
      firstName: 'Anna',
      lastName: 'Müller',
      birthdate: '1990-01-01',
      address: 'Musterstraße 1, 17207 Röbel',
    };
    const withData = reducer(initialState, { type: 'SET_CITIZEN_DATA', payload: data });
    expect(reducer(withData, { type: 'RESET' })).toEqual(initialState);
  });
});
