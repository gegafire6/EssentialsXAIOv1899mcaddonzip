# Graves menu and teleport history

Open **EssentialsX Menu → Teleport → Graves**, or use `!graves` / `!grave`.

- Select an active grave, then **Teleport**, to return to its saved coordinates and dimension. Newest graves appear first. Members see their own active graves; admins retain access to all active graves.
- **Previous Graves** lists your last 20 collected or expired graves, newest death first. Select one and choose **Teleport** to revisit its location. Items and grave entities are not recreated.
- History is saved in world dynamic properties, separately from active graves. It starts when a grave is collected, expires, or is removed by stale-record cleanup after this update. Existing active graves are supported. Records deleted before this update cannot be recovered.
- Teleports use the shared teleport delay, movement cancellation and combat restrictions. The record and access are checked again after the delay; unavailable records cancel the teleport. Blocked destinations report a teleport failure.

Item storage, grave protection duration, collection and despawn settings retain their existing behavior. Grave history stores locations only.

Validation uses simulated Minecraft events, menus, teleport calls and dynamic properties. In-game verification on a compatible Bedrock host with the pack's declared Beta APIs remains required for client forms, terrain/chunk loading and cross-dimension teleport behavior.

## Grave styles

Open **Graves → Grave Styles** and choose **Gravestone**, **Skeleton**, **Ataol / Coffin**, or **Cruz / Cross**. All four lie flat on the ground. Gravestone is the default and replaces the earlier upright model. The shared interaction/collision height is now half a block to match the horizontal models.

The choice is saved per player alongside their other settings and applies to their own active and future graves. Loaded graves change immediately; unloaded graves retain the chosen style in their record and update within five seconds of loading. Other players' styles and old history entries are unchanged. Missing/unknown styles fall back to Gravestone. Selecting a style never recreates a grave or its items.

The behavior pack selects a persistent variant using `essx:grave_<style>` events. The resource pack maps variants 0/1/2/3 to Gravestone/Skeleton/Coffin/Cross. Existing graves without style metadata use the owner's preference, otherwise the server default. Cosmetic failures do not interrupt item transfer or recovery.

The Cruz / Cross style adds a flat wooden Latin cross with brass details and a
matching transparent pixel icon. Its icon appears in Grave Styles and on active
and previous Cross grave records. The original three models and texture atlas are
preserved; the new style uses the same interaction height.

Rebuild Cross assets and their behavior/resource-pack bindings with Pillow from
`tools/rank-art-requirements.txt` installed:

```sh
python3 tools/build-grave-cross.py
node --test tests/grave-cross.test.mjs
python3 tests/grave-cross-assets.test.py
```

These checks exercise synthetic Minecraft events and pack mappings. Native
resource loading, visual alignment and interaction still require a compatible
Bedrock client.

## Server settings

Open **Admin Menu → Server Settings → Graves** to choose the default Gravestone, Skeleton, Ataol / Coffin or Cruz / Cross style, allow or lock player style choices, and set protection/despawn minutes. These duration controls have moved out of Combat / AFK without changing their saved keys or behavior.

When player choices are allowed, saved player preferences take precedence over the default. Disabling player choices applies the server default to all graves without deleting preferences; re-enabling restores each player's preference. Loaded graves refresh within five seconds; unloaded graves refresh after loading. New graves use the current policy immediately. The Graves style menu displays the server-selected style while choices are locked. Unknown defaults fall back to Gravestone.
