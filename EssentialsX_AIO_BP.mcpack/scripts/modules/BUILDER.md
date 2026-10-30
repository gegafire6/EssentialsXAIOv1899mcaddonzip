# Admin Builder — 20 Build Collection

An original collection of **20 generated templates** in six categories. No external
structure download, command blocks, or third-party build pack is required.

## How to use

1. Open the **Admin Panel → Builder • 20 Builds**, or type `!builder`.
   Existing admin permissions, developer authentication and Login restrictions apply.
2. Select **Get Builder Wand**. Hold the wand and **crouch** to reopen Builder.
   Crouching once opens one menu; standing resets the shortcut.
3. Choose a category, a build and the placement options. Selecting saves the build;
   it does not immediately change the world.
4. Stand, look at a solid block within **48 blocks**, then use the wand to place.
   `!buildplace` does the same without holding the wand.
5. Use **Undo Last Build** in Builder, or `!buildundo`, to restore the last snapshot.

## Included builds

| Category | Builds |
| --- | --- |
| Houses & Bases | Oak Balcony House; Desert Courtyard House; Spruce Gable Cottage; Overgrown Garden Manor |
| Farms | Irrigated Wheat Farm; Carrot Greenhouse; Automatic Cactus Harvester |
| Large Structures | Stone Watchtower; Castle Gatehouse; Timber Great Hall |
| Outdoor Decorations | Village Fountain; Garden Gazebo; Striped Market Stall |
| Fantasy Builds | Mushroom Cottage; Amethyst Crystal Shrine; Wizard Tower; Wizard Spire Manor |
| Utility Builds | Survival Workshop; Storage Depot; Lantern Footbridge |

The four medieval/fantasy houses use steep deepslate stair roofs, stone trim,
lanterns, timber balconies, supported flower boxes, furnished rooms and ladders.
Their proportions and palettes are inspired by the supplied reference images;
they are original compact templates rather than imported copies. The wizard
manor adds a climbable turret. Gardens and roof overhangs stay inside the saved
placement/Undo volume. Existing `oak_cabin` and `spruce_lodge` IDs are retained.

The wheat and carrot farms are manually harvested. The cactus harvester uses
natural cactus growth, adjacent growth-breaking fences, a water channel, hoppers
and output chests. It needs loaded chunks and normal random ticks. No crops,
items, mobs or growth are created by a repeating script.

## Placement options

- **Direction:** follow the current horizontal look direction, or choose South,
  West, North or East. This is the direction the build extends from its entrance;
  the entrance faces back toward the admin. Native structure rotation also rotates
  ladders, chests, hoppers and other block states.
- **Y-level:** place the lowest template layer one block above the targeted block,
  with an optional −32 to +32 offset, or enter an exact floor Y. For the bridge,
  this refers to the support base; the main deck is two blocks above it.
- **Replace blocks:** disabled by default. Without it the entire bounding box must
  be air, including the floor layer. Enable it deliberately for terrain placement.
  It replaces the whole volume, clearing space for interiors as well as placing
  blocks. It does not flatten terrain beyond that box or add supports below it.
- Stay outside the volume. Placement and Undo reject areas intersecting a player,
  unloaded blocks, out-of-range Y levels or denied `canBuild` permissions.
  The existing admin protection bypass setting applies.

## Undo and recovery

Before placement, the native structure manager snapshots **all blocks and block
entity data** in the rotated bounding box, with entities excluded. Failed placement
attempts restore that snapshot. If restoration also fails, the snapshot remains
available through Undo for recovery when the area is loaded again.

- One Undo snapshot per admin, with **16 snapshots maximum** across the session.
  A newer build replaces that admin's previous snapshot. Oldest snapshots expire
  when the limit is reached.
- Overlapping later builds invalidate older snapshots, preventing an older Undo
  from erasing a newer build placed through Builder. Affected online admins are
  notified.
- Undo restores the **whole box**, including later edits and container changes
  there. The menu asks for confirmation. Entities, dropped items, and world updates
  outside the box are not restored. Avoid interacting with containers before Undo.
- Snapshots are in memory: script/world reload ends Undo history. Selection is also
  session-only and is cleared on logout. The wand remains an inventory item.
- **Server Settings → Modules → Structure Builder** disables menu, wand placement and Undo.
  Re-enable it to use a snapshot while the same script session is still running.

Templates are bounded to 8,192 blocks of volume. The largest current template is
7,514 blocks of volume. Structures are generated in memory and placed through the
native structure API; no large command queue runs every tick.

## Validation

```sh
node --experimental-vm-modules --test tests/*.test.mjs
```

Tests use synthetic world state and mocked API events. Real Minecraft verification
is still required for native rotations, block entities, item-use and forms, crop
and cactus behavior, chunk loading, and Undo after world edits.

API references:
[StructureManager](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structuremanager),
[Structure](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structure),
[StructureCreateOptions](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structurecreateoptions),
[StructurePlaceOptions](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/structureplaceoptions).

## Area Edit item (v1.8.80)

Open **Admin Panel → Area Editor**, **Builder → Area Editor**, or `!areaedit`
(alias `!area`). Choose **Get Area Edit Item**, then use the new green pixel wand
on PC/mobile to open its tools. Grass/Clear now start walking modes; the original
fixed-coordinate features below are under **One-time Edit**. NPC Edit is unchanged; Builder Wand now has its
own pixel hammer icon. Grass Floor and Clear Area have new grass/eraser icons.

- **Grass Floor** defaults to the first reference: relative X/Z −10..+10, one
  layer of `minecraft:grass_block` at exact Y58 (21×21, 441 blocks). Change radius
  or choose a Y offset from your feet instead of exact world Y.
- **Clear Area** completes the second, truncated command as relative X/Z
  +30..+64 at exact Y90 (35×35×1, 1,225 blocks). Change width, depth, height,
  starting X/Z offsets and Y-level. Clearing uses `minecraft:air`.
- **Undo Last Edit** restores your latest Builder or Area Edit operation. Both
  tools share the same engine and history, so overlapping edits invalidate stale
  snapshots and the 16-admin session limit applies to both.

The origin is your floored position when the options form opens. Moving while the
form is open does not move the edit. Preview lists the fixed inclusive corners,
dimension and block count before confirmation. Switching dimensions cancels the
operation. Access, login and the Builder module are checked again after forms.

All existing Builder rules remain: max 8,192 blocks; loaded chunks; dimension Y
limits; protection checks; no player inside the volume; block-entity snapshots;
automatic rollback with recovery Undo if rollback fails. Grass overwrites its
layer; clearing removes blocks and containers in the box. Entities are excluded.
Undo also restores later edits/container changes inside the full box. World/script
reload ends session history. Disabling Builder disables Area Edit too.

One-time edits have no copied incomplete commands, arbitrary command inputs,
command blocks or edits outside the confirmed bounding box. The existing Builder engine is reused
unchanged. The pixel icons are generated by `tools/build-area-icons.py` using the
Pillow dependency already pinned in `tools/rank-art-requirements.txt`.

```sh
node --test tests/area-edit.test.mjs
python3 tests/area-icons.test.py
```

Tests simulate placement, permissions, UI and Undo. Verify real item-use/mobile
buttons, native structure snapshots, block entities, resource-pack rendering and
loaded-area behavior in a compatible Bedrock client before editing valuable builds.


## Walking Grass / Clear (v1.8.80)

1. Use Area Edit (or `!areaedit`) and choose **Grass Floor (Walk)** or
   **Clear Area (Walk)**. Configure the size/Y mode and confirm Start.
2. Hold **Area Edit** in the main hand and walk into another X/Z block. Standing
   still or jumping vertically in place does not repeatedly edit. The first batch
   starts on movement, not on confirmation.
3. Crouching, switching away from the item, or having a Builder/Area form open
   pauses the mode. It resumes on the next horizontal step while holding the item.
   Movement during a pause is not replayed.
4. **Stop Walking Mode** or `!areastop` turns it off. Starting another mode replaces
   your previous mode. Logout, script/world reload, dimension change, jumps over
   16 blocks in 3D, lost admin/developer/login access or disabling Builder stop it.

**Walking Grass** defaults to a 21×21 grass layer at current feet Y minus one.
The floor follows current X/Z and follows terrain height when using relative Y.
The radius can be 1–10. Exact world Y is still available.

**Walking Clear** defaults to a 7×7×4 air box at feet Y, starting two blocks ahead
of the cardinal direction of travel. Turning changes the clearing direction.
It leaves the default floor underneath you and keeps you outside the box, so the
existing no-player-in-box invariant is preserved. Width/depth can be 1–15 and
height 1–12, subject to the batch cap. Exact Y or a relative Y offset is available.
Stand back from a wall before starting so movement can trigger clearing ahead.

Moving origins intentionally replace the original fixed-origin behavior for
walking modes. Every batch uses your current feet position; the activation form
confirms dimensions and continuous behavior. **One-time Edit** keeps the old fixed
origin, Y58/Y90 defaults and corner preview.

Walking batches are capped at 2,048 blocks. One shared five-tick scheduler allows
one global batch per pass and a ten-tick per-admin cooldown, rotating between
active admins. High load can reduce per-player update rates. Edits occur at sampled
positions and do not interpolate skipped positions or replay a teleported path.

Protection, loaded-area, dimension-height and player-collision checks are unchanged.
A rejected or failed batch stops the mode and reports once; rollback/recovery uses
the same original BuilderEngine. No repeating commands or unbounded fills are used.

**Undo restores only the latest batch, not the entire path.** Earlier walking edits
remain. Each successful batch replaces your old Undo snapshot; normal overlap/
16-admin expiry rules still apply. Undo stops walking before confirmation so it
cannot immediately overwrite the restore. Manual one-time/structure placement also
stops walking. Snapshot/selection state is session-only.

Native Minecraft checks remain required for movement, input/mobile item behavior,
performance and real structure/container restoration; no compatible game runtime
is available in the sandbox.
