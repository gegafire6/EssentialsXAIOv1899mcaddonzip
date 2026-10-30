// EssentialsX AIO - By Opiar | Developer authentication for admin tools
import { DB } from "./db.js";
import { hashPassword } from "./hash.js";
import { err, isAdmin, modal, now, ok } from "./utils.js";

const VALID_FOR = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_SALT = "essx-developer-v1";
const PASSWORD_HASH = "877727c6db69e01c25ca4565f3e06c9236aabc7a47ea0df267b457679779e31a";
const prompting = new Map();

export function hasDeveloperAccess(p) {
  const expiresAt = DB.developerAuth.get(p.id)?.expiresAt;
  return isAdmin(p) && Number.isFinite(expiresAt) && expiresAt > now();
}

async function promptDeveloper(p) {
  const r = await modal(p, "§lDeveloper Authentication", [
    { type: "label", label: "§7Enter the developer password to unlock admin tools.\n§7Authentication is valid for 30 days." },
    { type: "text", key: "password", label: "Developer password", placeholder: "Enter password" },
  ], "Authenticate");
  if (!r) return false;
  if (!p.isValid || !isAdmin(p)) {
    err(p, "You don't have permission.");
    return false;
  }
  if (hashPassword(String(r.password ?? ""), PASSWORD_SALT) !== PASSWORD_HASH) {
    err(p, "Incorrect developer password.");
    return false;
  }
  DB.developerAuth.set(p.id, { expiresAt: now() + VALID_FOR });
  ok(p, "Developer authentication successful. Admin access is valid for 30 days.");
  return true;
}

export async function authenticateDeveloper(p) {
  if (!isAdmin(p)) {
    err(p, "You don't have permission.");
    return false;
  }
  if (hasDeveloperAccess(p)) return true;
  if (prompting.has(p.id)) return prompting.get(p.id);
  const request = promptDeveloper(p);
  prompting.set(p.id, request);
  try {
    return await request;
  } finally {
    prompting.delete(p.id);
  }
}
