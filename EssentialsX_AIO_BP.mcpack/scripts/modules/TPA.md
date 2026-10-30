<!-- coderabbit-ai-generated:v1 -->

# Teleport requests

Open **Essentials Menu → Teleport → TPA**, or use `!tpa` (replace `!` with the server's configured prefix). The player picker shows names beside a generic player-head icon; forms cannot display each player's skin as an icon.

- **TPA to Player** asks to teleport you to the selected player. **TPA Here** asks the selected player to teleport to you.
- Incoming requests have green Accept and red Deny buttons. Select an outgoing request under **Cancel outgoing request** to withdraw it, or use `!tpacancel [player]`; omitting the player cancels all your outgoing requests.
- The receiving toggle is shared with My Settings and persists across sessions. Switching it off blocks new requests; requests already received can still be accepted, denied, or expire.
- Remaining seconds are calculated when a menu opens. Use **Refresh** for an updated value. Requests expire after the server-configured TPA timeout (60 seconds by default), and are checked again when selected. A request from the same sender to the same recipient replaces their earlier request.
- After acceptance the player who will teleport must stand still for the server-configured teleport warmup (3 seconds by default). The warmup is shown in the menu and in the action bar. Admins keep their existing instant-teleport exemption. Movement cancels the warmup, as do death, logout, a dimension change by the moving player, or TPA being disabled. Existing teleport restrictions are rechecked before teleporting.
- **Back to previous location** appears when Back is enabled and uses the existing last-teleport/death location. That location is kept in memory for the current server session.

Commands: `!tpa [player]`, `!tpahere [player]`, `!tpaccept [player]`, `!tpdeny [player]`, `!tpacancel [player]`, `!tptoggle`, and `!back`. Player names with spaces should be quoted in commands. The timeout and warmup remain configurable in the admin teleport settings. Requests are session-only and are cleared when either player leaves.
