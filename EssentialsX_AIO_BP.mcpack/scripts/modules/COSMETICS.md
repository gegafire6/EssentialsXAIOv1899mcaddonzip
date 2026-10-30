# Cosmetic wearables

The six existing cosmetics keep their item IDs, prices, ownership and native Head/Chest slots. They require an empty armor slot, provide no protection or flight, and retain existing permission/vanish checks.

## 2D appearance (1.8.43)

The requested visual update replaces the former solid 3D hats and wings with original 64×64 pixel-art sprites, inspired by the supplied fantasy-hat reference. Each item icon and equipped texture uses the same artwork. Hats use two crossed, two-sided planes so they remain visible from the side. Wings use two two-sided planes and retain their flutter animation.

Geometry format 1.16 binds the wearable root explicitly to the player's `head` or `body` bone. Coordinates are local to that bone's pivot. The old armor locator offset animations are removed to avoid applying another translation after binding. Hats follow the head; wings attach behind the torso. The render controller permits UI rendering, hides the local first-person wearable, and permits third-person rendering.

Regenerate art and geometry from the repository root with:

```sh
python3 tools/build-cosmetics.py
```

This uses Python's standard library and the existing pixel canvas in `tools/build-rank-icons.py`. No downloaded artwork is used.

## Native Bedrock smoke check

Static asset checks cannot confirm Minecraft's attachable renderer. With both v1.8.43 packs active:

1. Remove helmet/chest armor, then equip each cosmetic through Cosmetics. Confirm its equipment slot, third-person appearance and inventory paper doll.
2. Look up/down and turn. Hats should follow the head; wings should stay behind the torso and flutter. View the wearer from another player's client, including the back and sides.
3. Switch between classic and slim skins, first/third person, rejoin and change dimensions. First-person view should stay unobstructed; equipment should persist.
4. Confirm occupied armor slots reject cosmetics without replacing armor, normal unequip restores an empty slot, and vanish/access loss removes the wearable as before.

The cloud sandbox has no Minecraft client/server; these in-game checks remain required on the target Bedrock version. Browser previews inspect the generated artwork only.

## Five continuous particle features (v1.8.79)

Open **Cosmetics** (`!cosmetics`, `!cos` or `!fx`) and choose:

| Category | New style | Existing access tier |
| --- | --- | --- |
| Above You Particles | Starlight Halo — orbiting gold sparkles above your head | Common |
| Above You Particles | Floating Hearts — three moving pink hearts above you | Rare |
| Head Crown Particles | Royal Crown — gold ring with five rising crown tips | VIP |
| Particle Wings | Angel Particle Wings — pale cyan mirrored feather outlines | VIP |
| Particle Wings | Flame Particle Wings — orange mirrored feather outlines | Legend |

Each category has **None (off)**. One selection per category is saved in player
cosmetics data, so above-you particles, crown and particle wings can all be active
at once and survive rejoining. These are separate from native Hats/Wings and the
existing Teleport, Trail, Kill and Join effects. They occupy no equipment slot,
replace no helmet/chest armor/Elytra and grant no protection, flight or damage.
Existing wearable empty-slot rules are unchanged. Particle wings are visual only.

Existing tier/ownership/purchase rules apply. Starlight Halo is free Common.
Rare uses the configured Rare price; VIP/Legend retain configured prices or require
an eligible rank/admin grant when price is zero. Admin grants, removal and reset
include all five new IDs: `halo_above`, `hearts_above`, `particle_crown`,
`particle_angel_wings`, `particle_flame_wings`. Reset clears every cosmetic selection
as before. Revoking access stops rendering a locked effect; it does not delete
other player data or armor. Existing selections/owned IDs are not migrated.

One shared five-tick scheduler follows current player position and yaw; wings
remain behind the torso and flutter, and shapes lower while crouching. Vanish and
Cosmetics off stop new particles, and None removes only its category. Existing
particles expire within 0.3 seconds. There is no repeated sound, persistent entity,
per-player timer or world modification. The five effects use original short-lived
single-particle emitters and two pixel sprites in the resource pack.

A continuous frame uses 3–32 particles per selected style (79 maximum with all
three slots). The scheduler caps its own work at 480 particles per five-tick pass
and rotates between players. Busy servers can show lower refresh rates/gaps as
players share the budget. Existing trigger/trail effects retain their settings and
are outside this new scheduler's budget. Selection previews emit one bounded style
frame; old selection previews retain their existing behavior.

Activate both v1.8.79 packs on all clients and enable particles in client settings.
Native appearance, tint/material compatibility, mobile performance, first/third
person views, turning/moving/crouching, dimension changes, vanish/off and reload
still need a compatible Bedrock client; the sandbox has no Minecraft runtime.
Generated geometry previews do not prove native particle rendering.

```sh
node --test tests/cosmetic-particles.test.mjs
# Pillow is pinned in tools/rank-art-requirements.txt.
python3 tools/build-cosmetic-particles.py
python3 tests/cosmetic-particle-assets.test.py
```

Particle component layout follows the official Mojang
[basic critical particle sample](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/particles/basic_crit.json).
The new sprites and geometry are original; existing particles/attachables are unchanged.
