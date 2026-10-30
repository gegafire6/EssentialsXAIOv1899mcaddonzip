// Shared session locks; no inventory or money is held in these transient sessions.
const locks = new Map();
export const activity = id => locks.get(id);
export function reserve(ids, kind, token) {
  if (ids.some(id => locks.has(id))) return false;
  for (const id of ids) locks.set(id, { kind, token });
  return true;
}
export function release(ids, token) {
  for (const id of ids) if (locks.get(id)?.token === token) locks.delete(id);
}
export const isDueling = id => locks.get(id)?.kind === 'duel';
export const duelPair = (a, b) => isDueling(a) && isDueling(b) && locks.get(a).token === locks.get(b).token;
