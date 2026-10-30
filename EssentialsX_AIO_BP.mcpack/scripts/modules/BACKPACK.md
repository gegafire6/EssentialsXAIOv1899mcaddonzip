<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4960d4756d4ff7d38ab845dfeeb85756bc6dddfb6023a3d718004a9166deeb2a -->

# Backpack — EssentialsX AIO v1.8.99

<!-- /coderabbit-ai-generated:v1 -->

The Backpack plugin replaces the AI Player gameplay feature. Both updated packs
are required. Enable the manifest's Beta APIs. Backpack is enabled by default;
manage it under **Admin Menu → Plugins → Backpack**.

## Bags and crafting

Craft at a crafting table. Each item has an original 32×32 pixel icon with a
transparent background, its own silhouette badge and an editable SVG master.
Bags do not stack and cannot be stored inside a Backpack.

| Item | Identifier | Storage available |
| --- | --- | --- |
| Leather Backpack | `essx:backpack` | 9 stacks |
| Iron Backpack | `essx:iron_backpack` | 18 stacks |
| Diamond Backpack | `essx:diamond_backpack` | 27 stacks |

Leather: eight leather around a chest. Iron: eight iron ingots around a Leather
Backpack. Diamond: four iron ingots in the corners, four diamonds on the sides,
and an Iron Backpack in the center:

```text
Leather       Iron          Diamond
L L L         I I I         I D I
L C L         I B I         D B D
L L L         I I I         I D I
```

The crafting result consumes the previous bag; stored items stay in the player's
personal save during upgrades. Recipes are also available through Creative's
Items category and `!backpack help`. Administrators can use vanilla `/give @s essx:backpack`, or the corresponding Iron/Diamond identifier.

## Use

Carry a bag in the main player inventory, then use it or open **Player Menu →
Community → Backpack**. The largest carried bag determines accessible capacity.
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:fec9d104d8947eb15fa502075f8e3a42810d2872f2900a6c71c79344c700a28b -->

The menu offers storage, auto-pickup, sorting, clear, lock, keep-on-death, skins and upgrades. One whole stack uses one slot when stored; **Sort** merges matching stacks. Withdrawal requires one empty player inventory slot. Overflow stays saved and is never dropped.

<!-- /coderabbit-ai-generated:v1 -->

Commands (`!` is the default server prefix; use the configured prefix):

- `!backpack` — open the menu. Aliases: `!bp`, `!bag`.
- `!backpack deposit` — store the currently held stack.
- `!backpack take <slot>` — take a stack from a numbered Backpack slot.
- `!backpack help` — recipes and usage.

Storage belongs to the **player in this world**, rather than to an individual bag
item. Giving away or dropping a bag does not give away its contents. Multiple
bags open the same personal storage. Items remain saved through death, respawn,
disconnect, dimension changes and script/world reloads. Losing a bag does not
erase storage; craft another to regain access. A smaller bag exposes the first
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:71ffd422a866ec3fd2a2d3431c4ed53b7fde8c4b3ef08e06d5f50b5ab95dd907 -->

9/18 slots plus any purchased rows; higher rows stay saved until sufficient capacity is available again.

<!-- /coderabbit-ai-generated:v1 -->

Disabling the plugin preserves its storage. Access requires a living, logged-in
Survival/Adventure player outside trades/duels. PvP combat access is blocked by
default; administrators can change that Backpack setting. Open menus reserve the
existing shared activity lock and release it on close, disconnect, death or
dimension change. Every write rechecks access, bag capacity and save revision;
store selections also recheck the selected item's metadata.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:1fa64060c1f70730014e180928bfc101bc04a8c963c7c07783d6d5e610db84e7 -->

## Menu features

Buy a Leather Backpack for 500 by default. A carried bag is required; buy permanent 9-slot upgrades for 1,000 each by default, up to 54 effective slots. Prices are configurable in the Backpack plugin settings.

Auto-Pickup moves supported collected items from the normal inventory when the Bedrock pickup event is available. Unsupported items, full storage, busy sessions, or failed transfers leave items in the normal inventory. Sort combines only matching item data. Clear requires confirmation and permanently deletes every accessible stack, preserving inaccessible slots.

Lock and keep-on-death apply to the highest-capacity carried bag. Lock prevents dropping and crafting it. Keep-on-death keeps that bag out of EssentialsX graves; stored items remain saved independently of the bag. Configure any other carried bags separately.

Leather and diamond backpack skins are visual-only chest-slot items. Remove chest armor, Elytra, cape or wings before equipping one. Skins are removed on vanish, module disable, or loss of the carried bag. Viewers need the resource pack.

## Supported items and persistence

<!-- /coderabbit-ai-generated:v1 -->

The storage uses a strict list of ordinary vanilla resources, common building
blocks and food. Supported items preserve stack amount,
name, raw lore, keep-on-death, adventure placement/breaking restrictions and
Script API dynamic properties. An exact round trip
is checked before moving an item. This menu uses forms; it is not a native
chest-grid interface.

**Excluded items:** custom add-on items (including bags), locked items, shulker
boxes/bundles, tools/weapons with hidden anvil prior-work data, armor with
possible trims/dye, shields/banners, crossbows with possible loaded ammunition, potions/tipped arrows, maps/compasses, written or
enchanted books, fireworks and other items with hidden or unsupported data.
Unknown item types are also refused. Plain books are supported. These exclusions
keep unsupported native data from being silently discarded. The exact allowlist
is in `scripts/core/backpack.js`; future support should demonstrate a lossless
round trip before allowing a new type.

Each player has one versioned world dynamic property (`essx:backpack:<playerId>`)
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:b9bcd3a91167d21dc553a2d6373ce26416e1b0c6f7ab34abefecfa4878bbfa6a -->

with 54 slots. Existing 27-slot saves migrate on the next successful change. Transfers run synchronously and save immediately;

<!-- /coderabbit-ai-generated:v1 --> they do not use
the add-on's debounced JSON tables. The save is limited to 30,000 UTF-8 bytes;
items exceeding that metadata budget stay in the source inventory. An unreadable
save is preserved and refused instead of reset. Do not remove world dynamic
properties when updating the add-on.

A failed storage write attempts to restore touched player slots. A failed
inventory rollback locks Backpack transfers and retains native recovery copies
for the current script session; if world writes work, it also saves a
`essx:backpack:<playerId>:recovery` marker containing the original slot data and
save revision. Administrators must reconcile the player inventory against that
snapshot and the original Backpack save before clearing a recovery marker. If
the engine refuses all world writes, avoid reloading until the retained native
copies have been recovered. Normal transfers do not create recovery markers.

## AI Player removal and old saves

The AI Player plugin registration, commands, menus, controller, animations and
visible skin are removed. A non-summonable, invisible compatibility entity and
small cleanup script remain solely to retire entities saved by v1.8.86. Each
loaded legacy entity returns whole native stacks to empty inventory slots of its
online living owner; leftovers drop through native inventory-on-death at the old
entity's location. Offline owners' supplies also drop there. Visit old companion
chunks to trigger cleanup; item drops follow normal game despawn rules. Old
companion identity properties are cleared. No companion can be spawned through
this update's commands or item menu. This migration preserves native data even
for items that Backpack storage does not accept.

## Icons

Editable masters: `assets/backpacks/*.svg`.
Runtime textures: `EssentialsX_AIO_RP.mcpack/textures/items/essx_*backpack.png` and
`textures/ui/essx/icons/backpack_store.png`, `backpack_take.png`.
Build with Python standard library only:

```sh
python3 tools/build-backpack-icons.py
```

## Verification

```sh
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4c91e668e4055855bca7bc4389e4ec08e07ec405e2fcd52c8761fc2ada47d9ef -->

node --test tests/backpack.test.mjs

<!-- /coderabbit-ai-generated:v1 -->
```

These tests run the actual core and module with mocked Minecraft APIs. They cover
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:16cc7f282716ef3ec258cc548452dc2fb3d75d1af8773ac201221f5a02aac26c -->

save migration, sorting, pickup fallback, rollback, purchase and capacity, lock, keep-on-death, skins and grave handling.

<!-- /coderabbit-ai-generated:v1 --> They do not establish native
Bedrock UI delivery, crafting unlocks, death drops or item-use behavior.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d93876f093010debdb70b0962139d02964ed4a1020302acc71d2c9a18c649baa -->

In Minecraft, verify both pack versions are 1.8.99

<!-- /coderabbit-ai-generated:v1 --> and check the content log. Test
crafting all tiers, using each item with full hunger, controller/touch use,
store/take with named materials and food, full inventories, upgrades/downgrades,
death, relog, world reload, plugin disable/re-enable and combat/trade/duel gates.
For an upgrade from v1.8.86, verify loaded companions retire and return/drop their
inventory once. Keep a world backup when testing beta APIs.

[ItemStack API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/itemstack?view=minecraft-bedrock-experimental)
documents the metadata available for reconstruction; opaque data is not assumed
serializable.
