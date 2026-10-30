<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:61f29d1bd5bf3d4bf97f35bb3bc82f83950f875071155ba07cb455f5025a3c8c -->

# S-Class artifact abilities — v1.8.93

<!-- /coderabbit-ai-generated:v1 -->

Ten artifacts have unique instant abilities and original pixel icons. They do not apply potion or status effects. Use an artifact while held or run `!artifacts use`; each has 10 uses before it breaks and a two-second shared recharge. Durability is shown on the item. This changes the v1.8.91 collectible-only behavior; existing identifiers, five recipes, and chest loot are retained. Existing items gain the durability component after the update (verify in a Bedrock test world).

| Artifact | ID | Recipe |
| --- | --- | --- |
| Aegis Heart | `essx:aegis_heart` | retained |
| Phoenix Ember | `essx:phoenix_ember` | retained |
| Tempest Feather | `essx:tempest_feather` | retained |
| Titan Gauntlet | `essx:titan_gauntlet` | retained |
| Void Prism | `essx:void_prism` | retained |
| Astral Compass | `essx:astral_compass` | loot only |
| Dragon Fang | `essx:dragon_fang` | loot only |
| Frost Relic | `essx:frost_relic` | loot only |
| Ancient Crown | `essx:ancient_crown` | loot only |
| Eclipse Orb | `essx:eclipse_orb` | loot only |

Use the Essentials Menu or `!artifacts` to browse; authenticated admins can use the Artifact Vault or `!artifactgive <id> [exact player name]`.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:751079377143ab1c7906f902961a87e26238f79d30dd62bfd30362cc41c8879f -->

## Abilities

| Artifact | Ability | Action |
| --- | --- | --- |
| Aegis Heart | Heart of Aegis | Restore 4 hearts. |
| Phoenix Ember | Phoenix Nova | Deal 4 hearts of damage to up to 6 hostile mobs within 5 blocks. |
| Tempest Feather | Tempest Dash | Dash forward while on the ground. |
| Titan Gauntlet | Titan Slam | Deal 3 hearts and push up to 6 hostile mobs within 4 blocks. |
| Void Prism | Void Step | Blink up to 6 blocks ahead to safe, accessible ground. |
| Astral Compass | Astral Search | Report direction and distance to the nearest loaded hostile mob within 32 blocks. |
| Dragon Fang | Dragon Bite | Deal 7 hearts to the first aimed hostile mob within 12 blocks and heal 2 hearts if damage is dealt. |
| Frost Relic | Frost Lance | Deal 3 hearts to the first aimed hostile mob within 10 blocks and push it back. |
| Ancient Crown | Ancient Mending | Repair the most damaged non-artifact inventory item by 25% of its maximum durability. |
| Eclipse Orb | Eclipse Cataclysm | Pull up to 6 hostile mobs within 8 blocks toward the player, then deal 8 hearts of damage to each. |

Successful activations play a custom sound and an animated particle burst; Eclipse Cataclysm has a larger purple burst. The sound and particles are cosmetic.

Damage uses native damage handling and only targets hostile mobs, not players or custom EssX entities. Blink checks destination safety, build access, and teleport restrictions; dash follows movement/teleport restrictions and grants short anticheat movement grace. Survival or Adventure, login, and no conflicting activity are required. The shared cooldown is per session and resets on disconnect. Existing repair services can repair damaged artifacts before they break.

No durability is spent if preparation fails (for example, no target, full health, no repairable item, blocked destination, or cooldown). Durability is written before the action: if a native action fails or only partly succeeds after the write, the use remains spent to prevent free repetitions.

<!-- /coderabbit-ai-generated:v1 -->

## Chest discovery

- Freshly generated Nether fortress and bastion loot has a 50% chance to contain one random artifact, equally weighted among all ten. Vanilla loot pools are retained from Mojang's Bedrock 1.21.90.3 samples. These loot tables override the five vanilla tables, and can conflict with other add-ons that override them. Updates to vanilla loot in future versions are not automatically inherited. Previously resolved chest loot is not refilled.
- The Woodland Mansion fake portal room's recognizable trapped chest can receive one random artifact on interaction. The detector looks for exactly two ender pearls, two nearby TNT blocks, a single chest, and an empty slot. It preserves the pearls and existing stacks and marks each location once. Other trapped chests, previously emptied/changed traps, and traps missing TNT do not receive items. A player-built chest that exactly mimics this pattern is indistinguishable from the generated trap. Redstone traps still work normally.
- Native loot tables remain active when the artifact plugin's menu is disabled. The trap detector also remains active. Full or unavailable inventories are left untouched.

## Replay removal

Record/replay commands, menus and recording/playback are removed. Previously saved world recording data is left intact. A compatibility cleanup retries restoring the saved position, camera and game mode for players who were viewing a replay, and removes leftover replay ghosts as their chunks load. Invalid return markers remain in player data for recovery. No recording export or viewer is provided in this version.

Bedrock runtime behavior has not been tested in-game; install both packs in a backup or test world first.
