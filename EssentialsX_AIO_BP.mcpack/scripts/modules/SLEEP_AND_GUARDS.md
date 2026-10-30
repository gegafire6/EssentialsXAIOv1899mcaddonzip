# OnePlayerSleep and built-in anti-cheat groups

Manage these plugins from **Admin Menu → Plugins**. All three are enabled by default when upgrading; saved opt-outs are preserved. Existing Anti-Cheat settings and punishments are preserved.

## OnePlayerSleep

One logged-in Survival or Adventure player in an Overworld bed can skip the night. Default: three seconds of continuous observed sleep, optional clear weather, and a morning announcement naming the sleeper. Configure delay (1–10 seconds), weather and announcements in the plugin settings.

Sleep is sampled every five ticks; waking, leaving, changing dimension, respawning, disabling the plugin or reaching morning cancels pending progress. Timers are individual, so another sleeper cannot inherit someone else's progress. Skipping advances the absolute world time to the next morning, retaining elapsed days. It does not change gamerules, weather when opted out, or player inventories/effects. Vanilla sleep may complete sooner if its own requirements are satisfied; this plugin does not override that. Native bed/rest effects are left to Minecraft.

Night Vote remains independent. The first successful night skip wins; the other feature drops its pending state when morning arrives.

## Celuna AntiCheat (Built-in)

An original EssentialsX combat check group requested under this name. **This is not the official Celuna addon and contains no imported Celuna implementation.**

- **Swing Rate:** more than 25 attack swings in a sliding 20-tick window, including misses. Mining animations are ignored. One violation per excess-window sample.
- **Multi Target:** four distinct melee targets in one server tick. Repeated hits on the same target do not increase the count.

The swing check requires the pack's declared beta `playerSwingStart` API. If unavailable, that check is inactive; other checks continue.

## Scythe AntiCheat (Built-in)

An original EssentialsX movement check group requested under this name. **This is not the official Scythe addon and contains no imported Scythe implementation.**

- **Water Walk:** 40 consecutive ticks of horizontal, level movement over open water with air at the feet; gaps reset evidence. Nearby solid edges/lily pads, unknown terrain, swimming, water immersion, riding, climbing, flight and gliding invalidate samples.
- **Air Jump:** an immediately consecutive change from falling (vertical velocity below -0.12) to rising (above 0.3), with no support/liquid in the loaded 3×3×3 region beneath the player. Normal ground jumps and unknown terrain are excluded.

Movement checks share existing admin, Creative/Spectator, lag, damage, respawn and dimension/teleport grace. Levitation, Slow Falling and Jump Boost suppress these new movement checks. A one-second grace after melee hits covers native Mace Wind Burst impulses affecting the attacker. EssentialsX teleport hooks also clear pending evidence. Server scripts that apply unusual impulses without damage/teleport hooks can still create suspicious evidence.

## Configuration and limits

Both groups require the main **Anti-Cheat** plugin. Their own switches enable/disable the corresponding checks; individual check switches and limits are available under **Configure Group Checks**, or **Anti-Cheat → Configure Checks**. New detections default to **Alert staff only**, at VL 8. Existing checks keep their existing settings. Staff alerts, alert muting, recent logs, persistent player records, live VL, decay and optional kick/temp-ban actions share the existing pipeline. Choose any automatic punishment only after observing the checks on your own world.

Evidence is session-only and removed on leave. Damage, dimension changes, respawn and EssentialsX teleports clear new pending evidence. No client packets, inventory scanning or external anti-cheat engine is used. These are heuristic server observations; they do not prove client modifications or offer complete cheat prevention. Multiplayer lag, native combat/movement, bed sleep and addon import still need in-game verification on a compatible Bedrock host with Beta APIs.

## Base detector update (v1.8.67)

See [ANTICHEAT.md](ANTICHEAT.md) for the new 5-block reach allowance, 13+ observed
attack threshold, Survival flight detection, walk/sprint speed evidence and dark
rare-ore vein heuristic. These intentionally update the old base detector defaults;
Celuna/Scythe group limits, existing check opt-outs and punishment choices remain
configurable. Unsupported-flight evidence now also excludes non-air feet/head
blocks such as webs and scaffolding. Original Scythe melee impulse grace remains.
