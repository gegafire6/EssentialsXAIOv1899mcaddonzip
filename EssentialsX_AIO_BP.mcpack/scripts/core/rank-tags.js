// Ten built-in decorative styles. Appearance never grants permissions.
export const RANK_TAGS = [
  {
    "id": "owner",
    "label": "OWNER",
    "group": "Staff",
    "color": "c",
    "glyph": "\ue50a",
    "icon": "textures/ui/rank_tags/owner",
    "chatGlyph": "\ue70a"
  },
  {
    "id": "co_owner",
    "label": "CO OWNER",
    "group": "Staff",
    "color": "c",
    "glyph": "\ue50b",
    "icon": "textures/ui/rank_tags/co_owner",
    "chatGlyph": "\ue70b"
  },
  {
    "id": "admin",
    "label": "ADMIN",
    "group": "Staff",
    "color": "c",
    "glyph": "\ue50e",
    "icon": "textures/ui/rank_tags/admin",
    "chatGlyph": "\ue70e"
  },
  {
    "id": "staff",
    "label": "STAFF",
    "group": "Staff",
    "color": "c",
    "glyph": "\ue50f",
    "icon": "textures/ui/rank_tags/staff",
    "chatGlyph": "\ue70f"
  },
  {
    "id": "mod",
    "label": "MODERATOR",
    "group": "Staff",
    "color": "9",
    "glyph": "\ue512",
    "icon": "textures/ui/rank_tags/mod",
    "chatGlyph": "\ue712"
  },
  {
    "id": "member",
    "label": "MEMBER",
    "group": "Player",
    "color": "7",
    "glyph": "\ue508",
    "icon": "textures/ui/rank_tags/member",
    "chatGlyph": "\ue708"
  },
  {
    "id": "vip",
    "label": "VIP",
    "group": "Player",
    "color": "b",
    "glyph": "\ue507",
    "icon": "textures/ui/rank_tags/vip",
    "chatGlyph": "\ue707"
  },
  {
    "id": "facebook",
    "label": "FACEBOOK",
    "group": "Social",
    "color": "9",
    "glyph": "\ue530",
    "icon": "textures/ui/rank_tags/facebook",
    "chatGlyph": "\ue730"
  },
  {
    "id": "roblox",
    "label": "ROBLOX",
    "group": "Social",
    "color": "f",
    "glyph": "\ue531",
    "icon": "textures/ui/rank_tags/roblox",
    "chatGlyph": "\ue731"
  },
  {
    "id": "telegram",
    "label": "TELEGRAM",
    "group": "Social",
    "color": "b",
    "glyph": "\ue532",
    "icon": "textures/ui/rank_tags/telegram",
    "chatGlyph": "\ue732"
  }
];
export function rankTag(id) { return RANK_TAGS.find(tag => tag.id === id); }
// Compact E5 badges are retired; keep readable labels on non-chat displays.
export function tagPrefix(tag) {
  return "§r§f§" + tag.color + "§l[" + tag.label + "]§r";
}
