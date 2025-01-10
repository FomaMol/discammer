/**
 * Local-only incident-action model for the message checker.
 *
 * This module deliberately contains stable identifiers only. It accepts no
 * message text, has no side effects, and gives the UI a deterministic action
 * plan from the impact types a reader selects for themselves.
 */

/** The five exposure types a reader can select in the inline action wizard. */
export const INCIDENT_IMPACTS = [
  'money',
  'credentials',
  'device',
  'identity',
  'received_only',
] as const;

export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

/** Stable, non-localized identifiers for action-plan rows. */
export const INCIDENT_ACTION_IDS = [
  'stop',
  'trusted_channel',
  'money',
  'credentials',
  'device',
  'identity',
  'tell_trusted',
] as const;

export type IncidentActionId = (typeof INCIDENT_ACTION_IDS)[number];

/**
 * A fixed display order keeps the plan calm and predictable under multiple
 * selections. It also means a reader sees containment before recovery work.
 */
const ACTION_ORDER: readonly IncidentActionId[] = INCIDENT_ACTION_IDS;

/**
 * The action IDs relevant to each selected impact. No selection is treated as
 * no asserted incident, so the caller receives an empty plan rather than a
 * false all-clear or a generic escalation path.
 */
const IMPACT_ACTIONS: Readonly<Record<IncidentImpact, readonly IncidentActionId[]>> = {
  money: ['stop', 'trusted_channel', 'money', 'tell_trusted'],
  credentials: ['stop', 'trusted_channel', 'credentials', 'tell_trusted'],
  device: ['stop', 'trusted_channel', 'device', 'tell_trusted'],
  identity: ['stop', 'trusted_channel', 'identity', 'tell_trusted'],
  received_only: ['stop', 'trusted_channel', 'tell_trusted'],
};

/** Guard unknown values before they become local UI state. */
export function isIncidentImpact(value: string): value is IncidentImpact {
  return (INCIDENT_IMPACTS as readonly string[]).includes(value);
}

/**
 * Build a deduplicated, stable-order action plan from selected impacts.
 *
 * This is intentionally a pure function. It neither receives nor returns a
 * user's message, URL, account name, or any other identifying information.
 */
export function actionIdsForImpacts(
  impacts: readonly IncidentImpact[],
): readonly IncidentActionId[] {
  const selectedActions = new Set<IncidentActionId>();

  for (const impact of impacts) {
    for (const action of IMPACT_ACTIONS[impact]) {
      selectedActions.add(action);
    }
  }

  return ACTION_ORDER.filter((action) => selectedActions.has(action));
}
