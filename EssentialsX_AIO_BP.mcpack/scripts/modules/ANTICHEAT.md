# Anti-Cheat detector update (v1.8.67)

Open **Admin Menu → Plugins → Anti-Cheat → Configure Checks**. Enable Beta APIs
and both updated packs. Detection uses server-observed events and movement;
it cannot inspect a client's installed cheats, raw mouse clicks or ore visibility.

## Requested detector settings

| Check | Default detection |
| --- | --- |
| Hitbox / Reach | Eye to nearest collision-box point greater than 5 blocks. Hits at 6–10 blocks and farther count. |
| Fly | Airborne Survival/Adventure flight bit for 10 consecutive samples, unsupported hovering after 25 air ticks, or sustained unsupported upward movement for 15 samples. |
| Speed | Six consecutive samples above normal walk/sprint speed × 1.35, adjusted for Speed effects. Uses both horizontal velocity and consecutive position displacement. |
| Auto Clicker | More than 12 observed attack swings in a rolling 20-tick window: 13–20 and higher count; 1–10 is allowed, 11–12 is tolerance. At most one violation per 20 ticks. |
| X-Ray | At least 4 dark rare ores in 3 separate veins, light level at most 3, with fewer than 12 other blocks mined per rare ore, within 90 seconds. |

The 5-block reach setting is this addon's requested allowance. It does not expand
Minecraft's native attack range or make normally rejected long-range attacks
produce a server hit event. Collision bounds come from `getAABB`; a standard player
box is used if that method is unavailable. Unknown bounds cannot prove reach.
Existing off-crosshair detection remains active.

Autoclicker uses `playerSwingStart` Attack events, including misses. Mining and
item-use animations are excluded. A simultaneous accepted-hit event is not counted
again. With no swing event API it falls back to accepted melee hits, deduplicated
per attacker/tick; that fallback cannot count misses or raw client CPS. Spectator
bot evidence remains separate and does not feed these combat checks. The separate
Celuna Swing Rate check retains its configurable 25-swing default.

## Legitimate movement and exemptions

Admin exemptions, Creative/Spectator modes, login state and lag guard apply.
Teleport, dimension changes and respawn clear pending evidence; hurt players get
40 ticks of grace. Gliding, swimming/water, climbing, riding, sleeping, Levitation,
Slow Falling and Jump Boost suppress movement evidence. Missing/unloaded terrain
cannot prove unsupported flight or excess speed. Webs, powder snow, scaffolding
and other non-air blocks at the feet/head invalidate unsupported flight evidence.

Normal ground jumps, falling and sprint jumps are allowed. Walking uses 0.21585
blocks/tick; sprinting and airborne movement use 0.2806 before tolerance/effects.
Ice and Soul Speed boots on soul sand/soil get 40 ticks of carry-over grace.
Mace hits with Wind Burst get 40 ticks of native impulse grace for Fly/Speed;
ordinary melee does not grant a movement bypass. The separate Scythe group keeps
its existing 20-tick melee impulse grace. Skipped server samples reset consecutive
movement evidence. Third-party scripts that apply unusual motion should be tested
with these limits and the server's configured exemptions.

## Dark mining and X-Ray

No torch by itself does **not** create an X-Ray violation. The detector also
requires rare-ore frequency and multiple spatially separate dark veins. Ores
within eight blocks of a recorded vein count as the same vein. A single ore vein,
ordinary dark stone mining, sufficient normal digging, lit mining and Night Vision
are excluded from the dark-ore evidence.

Light is sampled at the mined block and player eye block, using total light
(including torches, lanterns, lava and daylight). Missing light APIs, unloaded
blocks or failed reads do not count as darkness. Diamond/deepslate diamond,
emerald/deepslate emerald and ancient debris at Y ≤ 48 are tracked. Windows expire
after 90 seconds, and teleport/dimension/respawn resets prevent combining locations.
This replaces the older ore-ratio-only heuristic. These patterns remain evidence
for staff investigation, not proof of a modified client. The existing default
X-Ray action is **Alert staff only**.

## Saved settings and enforcement

An upgrade marker migrates values matching the old untouched defaults once:
reach 4.6 → 5, speed multiplier 2.6 → 1.35, autoclicker allowance 20 → 12.
Other custom limits, module/check opt-outs, max VL and punishment selections stay
saved. Later edits are preserved, including choosing an older numerical limit.
New X-Ray fields merge into saved worlds. Configure per-check limits in-game.

Existing styled alerts, staff muting, spectator broadcasts, logs/records,
violation decay and kick/temporary-ban actions use the same pipeline. A detection
adds VL; it does not imply an immediate kick/ban unless the configured VL/action
requires one.

## Verification

```sh
node --test tests/anticheat-detection.test.mjs
```

These tests run the actual event handlers and configuration migration with mocked
Bedrock world/player APIs. They cover thresholds, legitimate movement, lighting,
settings and punishment routing. Native event frequency, reach rejection, latency,
movement physics, lighting updates and addon import still need verification on a
compatible Bedrock host with Beta APIs.

API references: [Entity collision bounds](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-experimental#getaabb),
[AABB center/extent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/aabb?view=minecraft-bedrock-experimental),
[Block light levels](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/block?view=minecraft-bedrock-experimental#getlightlevel),
[Player flight state](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/player?view=minecraft-bedrock-experimental#isflying).
