// A record switched on or off gets its own action name, so the audit log reads plainly
export function toggleAction(
  entity: 'INSTITUTION' | 'STATION' | 'PLACE',
  changes: Record<string, unknown>,
  isActive?: boolean,
) {
  if ('isActive' in changes) {
    return `${entity}_${isActive ? 'REACTIVATED' : 'DEACTIVATED'}`;
  }
  return `${entity}_UPDATED`;
}
