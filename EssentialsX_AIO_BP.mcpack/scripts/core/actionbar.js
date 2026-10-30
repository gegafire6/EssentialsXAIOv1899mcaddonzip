// Shared actionbar notifications. The personal sidebar yields while a gameplay notice is visible.
const notices = new Map();
export function actionbar(player, text, holdMs = 3000) {
  player.onScreenDisplay.setActionBar(text);
  notices.set(player.id, Date.now() + holdMs);
}
export function actionbarBusy(id) {
  const until = notices.get(id) ?? 0;
  if (until > Date.now()) return true;
  notices.delete(id);
  return false;
}
export function clearActionbarNotice(id) { notices.delete(id); }
