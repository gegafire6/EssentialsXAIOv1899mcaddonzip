# Jobs, Player Trade and Duel Arena — v1.8.55

All three features appear in the main menu and can be toggled in Module Manager.
Jobs and Player Trade require Economy. Login and Survival/Adventure checks apply.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:8761387a1845ea3840ff7a8a215d4cadbcbb839bfa1e8294b78b08fdd9f70885 -->

## Jobs (`!jobs` / `!job`)

Choose one active job. Switching or leaving retains each job's XP. Every 100 XP adds one level. Salary starts at the original base rate and increases by 10% per level, capped at 3x, rounded to whole currency. This replaces the old fixed payout. The job detail button joins, switches, or leaves the selected job. Balance and progress update when the menu is reopened or refreshed.

| Job | Valid action | Base money | XP | Daily quest |
| --- | --- | --- | --- | --- |
| Miner | Break natural ore with a pickaxe without Silk Touch | 4 | 5 | 32 iron ores |
| Lumberjack | Break natural logs or stems with an axe | 3 | 4 | 32 logs |
| Farmer | Harvest fully grown wheat, carrots, potatoes or beetroot | 3 | 3 | 32 crops |
| Hunter | Kill a hostile monster | 8 | 10 | 16 monsters |
| Fisherman | Collect a fish or treasure fishing marker | 5 | 5 | 8 catches |

Each quest resets at UTC midnight and pays once per job per day. Quest rewards and level-adjusted salaries share the existing daily cap (10,000 by default); the quest reward is reduced if the cap would be exceeded. Actions are throttled to one per 150 ms. Creative/Spectator, unlogged players, players in an activity, and disabled Economy do not earn job rewards. Player kills and EssX entities never count. Existing economy mob rewards are additional.

From level 5, eligible actions have a 2% chance of an extra single resource, rising by 0.5 percentage point per level to 20%. This is an extra base resource, not a copy of the actual loot stack: Fortune, random loot counts and enchantments are not duplicated. The perk covers listed ores, modern logs and mature crops, plus common zombie, skeleton, creeper and spider drops. Other mobs and fishing catches have no extra-drop perk.

Placed ores and logs are tracked from this version onward, even while Jobs is disabled. Pre-existing placements and blocks moved by other add-ons cannot be reliably identified. Only manual break events pay; blocks broken by other scripts do not earn additional XP.

Fish and treasure loot tables include a private marker consumed before item pickup; the player who collects it receives the fisherman reward. This requires the Bedrock item-pickup before event. If unavailable, Fisherman cannot be selected. Three vanilla 1.21.90.3 fishing loot tables are overridden and may conflict with other add-ons; future vanilla table changes are not automatically included. A full inventory, another entity collecting a marker, or unusual fishing behavior may affect attribution and must be tested in Bedrock.

The Job Leaderboards show the top ten saved players per job, ordered by XP. Commands: `!job miner`, `!job lumberjack`, `!job farmer`, `!job hunter`, `!job fisherman`, and `!job leave`. Names and progress persist through switching and leaving.


<!-- /coderabbit-ai-generated:v1 -->

## Player Trade (`!trade`)

1. Stand within 10 blocks of the other player in the same dimension.
2. Open Player Trade, pick a player; the recipient opens `!trade` to accept/decline.
3. Each player edits an offer of up to nine whole inventory stacks and whole money.
4. Both review the complete offers and confirm the same revision. Any edit clears
   both confirmations. A failed final validation also clears confirmations.
5. Transfer rechecks eligibility, balance, original slot contents and empty space.

Offers show names, counts, enchantments, wear and lore. Exact cloned ItemStacks
preserve native metadata. Ordinary stackable vanilla items and supported vanilla
weapons/tools/armor can be offered. Shulker boxes, bundles, other opaque containers,
locked items and addon items are excluded. Incoming stacks require empty slots;
slots freed by outgoing items count. Trade does not drop leftovers on the ground.

Offers hold no escrow. Death, logout, distance, disabled modules or the two-minute
request/session expiry cancel without taking items or money. No async boundary
exists inside commit. Inventory writes occur before money updates; an engine write
error triggers rollback. Failed rollback retains in-memory copies and the session
lock for retry; related commands/interactions are blocked during recovery. An
abrupt process crash during native writes is not a durable distributed transaction;
this sandbox cannot establish engine crash behavior. Requests/offers are transient
and are discarded on normal script reload. No partial item serialization is used.

## Duel Arena (`!duel`, admin `!duelarena`)

Admin setup: build a safe arena, allow PvP and damage in its region/claim, then use
`!duelarena` at each desired spawn to save A and B. Spawns must be 4–40 blocks apart
in one dimension. One match uses the arena at a time. Setup refuses active matches.

Choose Sword, Axe or Bow kit rules, hold your own matching weapon, then select an
opponent. Recipient opens `!duel` and explicitly accepts; both must hold a matching
weapon. These are **personal-gear kits**: no free equipment, inventory replacement
or personal-item serialization. Bow accepts bows/crossbows; each shot consumes
normal ammunition. All other item-use effects and block interactions are blocked.

The match uses separate 20-point duel HP, cancels native damage and only counts
opponent hits using the selected kit. Armor/normal health remain native and are
not restored/replaced; no real death means no ordinary kill rewards, graves,
Lifesteal or killstreak payouts. Friendly-fire restrictions are bypassed only for
the explicitly consenting paired duelists; normal clan protection remains.
Existing region/claim damage/PvP protection still applies. Outsider attacks and
attacks by duelists against outsiders are cancelled. Native environmental damage
is cancelled during the match. Duels require the experimental before-Hurt API.

Zero duel HP, forfeit (`!duel`), logout, changing modes/dimension or leaving the
50-block sphere centered between spawns resolves a win/loss once. Three-minute
timeout or module disable records a draw. A failed startup records no result.
The first decisive hit remains the result even if a disconnect follows it.

Original positions are saved/flushed before teleporting. Normal teleport commands,
including previously scheduled warmups, are blocked during the match. At the end,
players return with their own inventory unchanged. Interrupted matches recover
positions on login/reload, without minting wins/losses. Blocked returns retain a
persistent retry record; clear the original location or retry with `!duel`.
Wins, losses and draws persist and are visible in the Duel menu.

## Verification

`node --experimental-vm-modules --test tests/player-features.test.mjs`

Uses actual feature modules and Economy under mocked Minecraft events, containers,
forms, DB, clock and world. Native inventory, combat, forms and world teleport
behavior still require a compatible Bedrock host with Beta APIs and both packs.
