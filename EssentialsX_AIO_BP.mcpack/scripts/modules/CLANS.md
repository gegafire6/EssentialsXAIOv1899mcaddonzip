# Simple Clan System — v1.8.88

A Minecraft Bedrock add-on update. Existing clans, names, tags, members, officers, bank balances, homes and kill totals are preserved. Existing clans stay invite-only until their leader opens joining. Backpack items and icons remain included; AI Player gameplay remains removed.

## Commands

The default command prefix is `!` (use your server's configured prefix if changed). These are chat commands, not native `/clan` commands. Open the member menu → Clan for forms.

| Command | Action / permission |
| --- | --- |
| `!clan` | Open clan menu |
| `!clan create "Clan Name" [TAG]` | Create a clan; optional tag is generated automatically. Default fee: 1,000; admins bypass the fee. Name: 3–20 letters, digits, spaces, `_`, `-`; tag: 2–5 letters/digits. |
| `!clan list` | Browse clans, info and Join buttons |
| `!clan join <name or tag>` | Join an open clan or accept an invite |
| `!clan join` | Accept your single active invite |
| `!clan invite "Player Name"` | Leader/Officer invites an online player by exact name |
| `!clan leave` | Member/Officer leaves; leader transfers or disbands first |
| `!clan info [name or tag]` | Leader, members, ranks, online status, creation date, bank, kills, joining mode and relations |
| `!clan chat` | Toggle ordinary messages between clan/private and public |
| `!cc <message>` / `!clan chat <message>` | Send a private clan message |
| `!clan sethome` | Leader/Officer sets a safe home on land they may build on |
| `!clan home` | Teleport with the server warmup; combat, activity, membership and destination checks apply |
| `!clan bank` | Show shared balance |
| `!clan bank deposit <amount>` | Any member deposits a positive whole amount |
| `!clan bank withdraw <amount>` | Leader withdraws |
| `!clan promote "Player Name"` | Leader promotes Member to Officer |
| `!clan demote "Player Name"` | Leader demotes Officer to Member |
| `!clan kick "Player Name"` | Leader kicks any other member; Officer can kick Members |
| `!clan transfer "Player Name"` | Leader transfers leadership, with confirmation; former leader becomes Member |
| `!clan open on` / `!clan open off` | Leader enables/disables open joining |
| `!clan ally <name or tag>` | Leader sends an alliance request; the other leader uses the same command with your clan to accept |
| `!clan enemy <name or tag>` | Leader declares an enemy relation and removes any alliance/request |
| `!clan neutral <name or tag>` | Leader clears the relation in both directions |
| `!clan disband` | Leader confirms deletion; shared bank returns to the current leader |

Rank/kick/transfer commands support offline members by exact remembered name. Quote names containing spaces. `!c`, `!guild`, `!team` alias `!clan`. Private clan chat uses the existing command prefix; a bare `!` is not a separate private-message shortcut.

## Permissions and behavior

- Leader → Officer → Member; one clan per player. Default limit: 15 members.
- Officers can invite, set home, and kick Members. Rank changes, leadership transfer, settings, diplomacy, withdrawal and disband require the current Leader.
- Forms recheck current membership, clan identity and roles after selections/confirmations. Leaving/kicking clears Officer privileges and switches active clan chat back to public with a notice.
- Invitations and alliance requests persist in clan storage and expire after 300 seconds by default. Open joining still enforces capacity. Clan disbanding removes its relations; recreating its tag does not validate old menus or requests.
- Both leaders must agree to an alliance. Same-clan PvP is blocked by default; allied PvP is blocked. Consensual arena duels retain the existing duel rules. Enemy status never overrides protected regions or other PvP restrictions. Friendly/self kills do not raise clan kill totals.
- Existing `[TAG]` prefixes remain in chat and the add-on's player nametags. This does not add a native Bedrock tab-list API.
- Clan chat checks login, mute, word filtering and cooldown, strips player formatting, and only sends to logged-in clan members. Private-mode messages remain intercepted while clans are disabled or the sender is locked.
- Home needs two air blocks above solid, nonhazardous ground, loaded in its dimension. Home is checked again after warmup; a kick, disband, plugin toggle, combat or busy activity cancels travel. Claim/build permissions apply when setting the home.
- Bank uses this add-on's existing economy. **Vault is a Java server plugin API and is not included in this Bedrock `.mcaddon`.** Economy must be enabled for paid creation and bank transfers/refunds. Amounts and resulting balances must be nonnegative safe integers; fractional/scientific input is rejected.
- Storage uses the add-on's existing cached world dynamic-property database and save cycle. This update does not add crash-atomic transactions across economy/clan tables; keep world backups.
- Plugin Manager → Simple Clan System configures create cost, member limit, invite/request expiry and same-clan friendly fire. Clan Settings keeps name, join mode and tag color controls. Clan Manager retains authenticated admin deletion with a live authorization check.

## Install and verification

Import `EssentialsX_AIO_v1.8.88_Clans.mcaddon`, enable its BP and RP, and retain the world's existing data. UUIDs stay unchanged for updates. Use a backup/test world first. The pack retains its existing `@minecraft/server` 2.11.0-beta and `@minecraft/server-ui` 2.3.0-beta requirements; enable the appropriate Beta APIs experiment on a compatible Bedrock version.

Node regression checks use synthetic Minecraft events, players, menus and blocks. Archive integrity, pack versions and source bytes are checked separately. No Minecraft engine/client/world is available in the task sandbox. Live forms, chat/nametags, dynamic-property persistence after restart, teleport collision behavior and damage cancellation (including bows/projectiles) still require in-game checks. PvP protection depends on `world.beforeEvents.entityHurt` being available in the selected beta runtime, as in the prior clan module.
