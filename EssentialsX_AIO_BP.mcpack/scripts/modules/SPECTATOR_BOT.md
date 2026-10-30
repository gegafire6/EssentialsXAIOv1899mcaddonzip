# Spectator bot Kill Aura warnings

The Anti-Cheat plugin creates one invisible, invulnerable `essx:spectator_bot`
behind each living online player. It teleports directly behind its owner every server tick, including across
dimensions. It has no collision, gravity, drops, attack AI or mob kill reward.
ClearLag protects it. Its damage sensor blocks health loss. The client keeps the classic humanoid geometry with a fully transparent 64×64
texture under `entity_alphatest`. This replaces the empty-model approach to retain
model/picking bounds while rendering no visible pixels. An explicit
`minecraft:custom_hit_test` box matches the server collider (width 0.6, height 1.8,
center 0.9 above the feet). Native picking still needs target-client verification.
The server keeps its 0.6 × 1.8 hitbox and remains hittable; this does not use player
Spectator game mode. Its feet follow the player's feet, two blocks behind the
horizontal view direction. A turn or teleport is applied on the next server tick;
server lag and client replication can still add visible timing delay.

## Detection (preserved in v1.8.51)

Detection counts melee attacks instead of bot deaths. Every **20 melee attacks by
one player** against tracked spectator bots broadcasts this message to all online players:

```text
[Anticheat] PlayerName Using Kill Aura Hacks | Violation 1/3
```

Hits 1–19 produce no violation. Hit 20 adds one violation and resets that player's
hit counter, so hits 40 and 60 advance to `2/3` and `3/3` before VL decay.
Hits across different tracked bots count for the same attacker; different players'
hits are counted separately. Detection uses both melee-hit notifications and
Attack-swing raycasts so damage immunity cannot make it depend solely on a damage
notification. A raycast must hit the nearest entity within three blocks, stop at
solid blocks, and identify a tracked bot. Mining, misses, farther targets and
nearer non-bot entities do not add bot evidence. Duplicate callbacks for the same
attacker/target/server tick count once, including the 20th hit. The bot remains
alive. Bot deaths, projectiles,
untracked entities and administrative removal do not add hits or violations.
An intentional or accidental melee attack can also hit a bot; this is a heuristic.

Under **Anti-Cheat → Configure Checks → Kill Aura: Spectator Bot**, the check is
enabled by default with max VL 3 and punishment action **Alert staff only**. The requested warning
is broadcast globally regardless of staff alert preferences. Staff receive that same global message once, without a second staff-only violation alert.
Other checks use `[Anticheat] PlayerName Using <check label> Hacks | Violation <VL>/<maxVL>`
for staff alerts, respecting staff alert preferences and the existing throttle.
As of v1.8.64, all violation and punishment announcements share a red bold
`[Anticheat]` tag with gray brackets, a white player name, and a gold check name.
Warnings use yellow action text, a gray separator/Violation label, and a red count.
Kick/ban announcements use red action text and the same gold check name:

```text
[Anticheat] PlayerName was kicked for Hitbox / Reach.
[Anticheat] PlayerName was banned for Kill Aura.
```

These chat presentation changes replace the earlier unformatted violation text.
Diagnostic details remain in logs rather than chat.
Records, logs, VL decay and optional punishment settings use the existing pipeline.
At max VL, live VL resets. Disconnect clears live VL and partial hit counts;
player death, record clearing and disabling the check also clear partial counts.
Existing admin, Creative/Spectator, login and lag exemptions apply: ineligible hits
clear partial evidence and do not count. Followers still follow exempt players.
Rejected tracked bot hits receive a private reason: disabled check, admin exemption,
Creative/Spectator, login or lag guard. Notices repeat at most once per ten seconds
for the same reason; a changed reason is shown immediately. Partial evidence still
resets. Use admin command `!ac bot` or **Anti-Cheat → Spectator Bot Status** to see
eligibility, your counted hits out of 20, follower availability and swing API support.
Status does not add hits or change saved settings.
To test as an admin, open **Plugins → Anti-Cheat → Configure Settings**, turn
**Exempt admins** off, and use Survival or Adventure. No saved exemption setting
is changed automatically.
Bot hits do not feed the other combat checks.

Disabling this check or Anti-Cheat removes followers and clears partial hits.
Disconnects and player deaths remove their follower; loaded leftovers from reloads
are swept every five seconds. Enable the manifest's Beta APIs and install both
updated packs.

## In-game verification

1. Activate both v1.8.51 packs, reload the world and enable Beta APIs.
   Join with two Survival players; enable Anti-Cheat and this check. Disable
   **Exempt admins** if the testers are admins. Run `!ac bot` before and after
   a few controlled hits: the count must advance, and any blocker is explained.
2. Walk, turn, teleport and change dimension. Use `/testfor @e[type=essx:spectator_bot]`
   to check one follower per living player even though no model is visible.
   Confirm no robot skin renders from any side. Use another player's follower
   for a controlled crosshair test: stand facing the space two blocks behind that
   player at body height. Check that turns and teleports promptly reposition it.
3. Melee a tracked bot two blocks behind another player. Confirm Beta APIs and
   the attack-swing event are available. Verify it survives every hit;
   hits 1–19 produce no message. On hit 20, all online players receive the named
   warning once. Repeat another 20 and 40 hits before decay for `2/3` and `3/3`.
   Default settings must not kick or ban.
4. Alternate two attackers and different followers. Each attacker needs their own
   20 hits. Shoot a bot or remove one with commands; no violation should appear.
5. Test exempt attacks, disconnect, death/respawn, record clearing, check disable
   and script reload. Verify partial hit counts reset and one follower returns
   per living player when enabled.

## Automated regression checks

```sh
python3 tools/build-spectator-skin.py
node --experimental-vm-modules --test tests/spectator-bots.test.mjs
```

These tests use a mocked Minecraft event/raycast API and the actual anti-cheat
module. They cover swing-only warnings with no damage callback, both callback
orders, warning boundaries, raycast filtering, exemptions, consecutive-tick movement,
follow scheduling and follower lifecycle.
They do not establish native Bedrock event delivery, ray obstruction or rendering.

API reference: [Entity.getEntitiesFromViewDirection and EntityRaycastOptions](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityraycastoptions?view=minecraft-bedrock-experimental).

Hit-test component reference: [minecraft:custom_hit_test](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_custom_hit_test).
