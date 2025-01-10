import { describe, expect, it } from 'vitest';
import {
  INCIDENT_ACTION_IDS,
  INCIDENT_IMPACTS,
  actionIdsForImpacts,
  isIncidentImpact,
} from './incident_actions';

describe('incident-action model', () => {
  it('defines exactly five stable, selectable impact ids', () => {
    expect(INCIDENT_IMPACTS).toEqual([
      'money',
      'credentials',
      'device',
      'identity',
      'received_only',
    ]);
    expect(new Set(INCIDENT_IMPACTS).size).toBe(INCIDENT_IMPACTS.length);
  });

  it('accepts only declared impact ids', () => {
    expect(isIncidentImpact('money')).toBe(true);
    expect(isIncidentImpact('unknown')).toBe(false);
    expect(isIncidentImpact('')).toBe(false);
  });

  it('returns no plan without an asserted impact', () => {
    expect(actionIdsForImpacts([])).toEqual([]);
  });

  it('keeps containment first for a money impact', () => {
    expect(actionIdsForImpacts(['money'])).toEqual([
      'stop',
      'trusted_channel',
      'money',
      'tell_trusted',
    ]);
  });

  it('combines repeated impacts without duplicate actions', () => {
    expect(actionIdsForImpacts(['credentials', 'money', 'credentials'])).toEqual([
      'stop',
      'trusted_channel',
      'money',
      'credentials',
      'tell_trusted',
    ]);
  });

  it('only returns stable action ids in the documented order', () => {
    const plan = actionIdsForImpacts([...INCIDENT_IMPACTS]);
    expect(plan).toEqual([...INCIDENT_ACTION_IDS]);
    expect(new Set(plan).size).toBe(plan.length);
  });
});
