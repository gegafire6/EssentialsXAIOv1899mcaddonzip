# Player Health Bar (v1.8.82)

Open **Admin Menu → Plugins → Player Health Bar**. Enable/disable it independently
of **Mob Health Bar** and **Rank Nametags**. Choose one of the three numbered
style buttons or use **Configure Settings → Health style**:

1. **Green Bar + HP**: shaded red heart, outlined green horizontal bar, white
   current HP above the name (reference 1).
2. **Small HP + Red Heart**: name above regular-size white HP text and a flat red heart
   (reference 2).
3. **Heart + Current / Max**: white-bordered red heart and white `10/20` above
   the name (reference 3).

This is a server-wide style for players' overhead name tags. Existing rank, clan
and nickname text stays on its own name line when Rank Nametags is enabled.
With Rank Nametags disabled, health displays above/below the normal player name.
Vanish hides the entire tag. Health updates every five ticks, including healing,
damage, respawn and effective maximum-health changes. HP means health points
(20 HP is ten normal hearts). Values are clamped to the effective maximum; missing
or invalid health omits the health line. Mob labels and health are unchanged.

Existing worlds infer the new switch once from their old Mob Health Bar and Rank
Nametags switches, preserving disabled player-health displays. Later player/mob
switch changes are independent. Saved style/switch choices survive reload. Disabling
player health removes its line; disabling both managed tag features restores the
previous name if it is still our output. Other plugins' replacement names survive
that cleanup. Disconnecting players are removed from the ownership cache.

All three hearts, ten reserved legacy larger digits and 21 green-bar fill states are original
hard-edge pixel assets in **font/glyph_E8.png**, generated using the references.
E8 does not restore any removed E5 rank badges; E5/E6/E7 are unchanged. The bar is
composed of four glyph tiles. Activate both v1.8.77 packs for every recipient and
reload resources/world. Packs replacing E8 can conflict. **Text only** provides
ordinary characters if custom font glyphs are unavailable.

The layouts/colors/shapes follow the supplied images. Native font scale, glyph
spacing (including seams between bar tiles), name-tag background, camera distance
and self-name visibility are controlled by Bedrock/the client. Exact screenshot
pixel size and spacing are not guaranteed by these scripts. Confirm all three
styles on the target device: full/half/zero HP, healing, changed maximum HP,
Rank Nametags off/on, Mob Health Bar off/on, vanish, disable/re-enable and reload.
There is no Minecraft runtime in this sandbox; PNG previews are asset checks.

## Verification

```sh
node --test tests/player-health.test.mjs tests/rank-display.test.mjs
# Use the Pillow version pinned in tools/rank-art-requirements.txt.
python3 tools/build-player-health.py
python3 tests/player-health-assets.test.py
```

The asset tests compare E5/E6/E7 with `ESSX_PREVIOUS_ADDON` when the v1.8.76 artifact
is available. Normal checkouts without that artifact skip only that comparison.

## Smaller HP number (v1.8.82)

Style 2 (saved index 1) uses ordinary, unbolded digits for HP, matching the numeric
text size used by the other health styles. This replaces its oversized bitmap
number; the flat red heart and name-above-health layout are unchanged. Saved
style choices, health calculations and refresh behavior remain the same. Legacy
E8 digit cells remain reserved; no font assets change. Activate both v1.8.82 packs
and reload resources/world to apply the script update.
