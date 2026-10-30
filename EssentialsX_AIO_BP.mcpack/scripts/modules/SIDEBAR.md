# Personal sidebar

The RANK value shows the assigned compact badge with its colored rank name, such as MEMBER (v1.8.85). Custom text-only roles and explicit icon opt-outs retain text.

The personal scoreboard displays USER, assigned RANK badge, cyan MONEY label with a green amount, XYZ, KILLS, DEATHS, XP LEVEL, WORLD and K/D in that order. XP Level, World and K/D stay below Deaths; rows never rotate. K/D divides kills by deaths, using one when deaths are zero. XP is the native Minecraft player level.

All nine background themes use a compact profile panel that fits all nine rows. The surplus space below K/D is removed; the footer and server stats sit closer to the profile. Text size and row order are preserved. Server-summary mode and rank priority rules are unchanged.

Open **Admin Menu → Plugins → Sidebar Scoreboard** and use **Show XP / world / K-D below deaths** to show or hide the last three rows. Enabled by default for existing worlds; saved opt-outs are preserved. `!hud` still toggles personal visibility.

Static and simulated integration checks cover formatting and refresh behavior. In-game appearance and importing require a compatible Bedrock client with this resource pack and the declared Beta APIs.

## Three new backgrounds and icons (v1.8.84)

Open **Admin Menu → Plugins → Sidebar Scoreboard**. Choose the background in
Configure Settings or use one of three quick-select actions:

- **Midnight Blue • Moon**: navy cards, blue highlights and a crescent icon.
- **Emerald Glass • Gem**: dark teal panels, emerald edge and a faceted gem icon.
- **Royal Gold • Crown**: plum cards, thin gold frame and a crown icon.

Each design has a dedicated 32px pixel menu icon and a small background emblem.
The dark text areas keep stats readable. Original six choices and saved selections
stay available; switching themes preserves all stats, row order and text size.
Choices apply server-wide to personal sidebars on their next one-second refresh.
They do not enable a hidden/disabled sidebar or change shared server-summary mode.
Activate both v1.8.84 packs and reload resources. Rebuild original assets with
`python3 tools/build-sidebar-backgrounds.py` using the existing pinned Pillow.
Native rendering still requires verification in Minecraft.
