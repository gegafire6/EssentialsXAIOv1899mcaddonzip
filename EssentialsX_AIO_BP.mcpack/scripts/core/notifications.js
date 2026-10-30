// Formatting-only marker routes shared notices to the Quest-style top notification.
export const QUEST_TOAST_MARKER = "§0§r§7§r";

// Formatting-only suffixes select account icons without depending on custom fonts.
export const NOTICE_ICON_MARKERS = { register: "§0§r§8§r", welcome: "§0§r§9§r" };

export function topbarNotice(player, heading, message, refresh = false, icon = "quest") {
  try {
    const iconMarker = icon === "register" || icon === "welcome" ? NOTICE_ICON_MARKERS[icon] : "";
    player.onScreenDisplay.setTitle(QUEST_TOAST_MARKER + iconMarker + `${heading}§r\n§f${message}`, {
      subtitle: "", fadeInDuration: refresh ? 0 : 5, stayDuration: refresh ? 30 : 60, fadeOutDuration: 10,
    });
  } catch {} // A disconnected player's display must not interrupt account/quest persistence.
}

export function questCompleteNotice(player, name, reward) {
  topbarNotice(player, `§a§l${name} Completed`, `+${reward}`);
}
