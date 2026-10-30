# Rank and sidebar pixel art (v1.8.76)

The built-in catalog contains Owner, Co Owner, Admin, Staff, Moderator,
Member, VIP, Facebook, Roblox and Telegram. Metadata is in `scripts/core/rank-tags.js`; rebuild assets with
`python3 tools/build-rank-icons.py` using the environment below. Retained E5 and E7
codepoints do not change; unassigned E7 cells are transparent.

- Ten compact rank icons: `textures/ui/rank_tags/<id>.png`, 64×64 RGBA canvases with centered 16×16 artwork reduced from the authored 64px grid.
  Owner uses a gold/ruby crown; Co Owner silver/sapphire; Admin red/gold.
  Staff has a red shield/cross, Moderator a blue shield/sword, Member a silver
  shield/diamond, and VIP a faceted cyan star with a gold center.
- Ten horizontal label strips: `<id>_badge.png`, 64px high.
- The ten retired E5 compact badge cells are transparent. Their codepoints remain reserved.
- E7 chat-only rank sprites: the same compact icon in each 64px cell (24px transparent inset).
  High contrast outlines and bright facets keep the silhouettes distinct.
- Facebook uses a blue f badge, Roblox a silver tilted square, and Telegram a cyan paper plane.
- E6 sidebar sprites and all twelve standalone sidebar icons are unchanged.
- E7 is now 1024×1024 (16×16 cells); E5 and E6 remain 256×256. E7 holds
  icons, not full labels. This intentionally supersedes the old all-256px layout.

Sprites use hard palette colors, beveled metal, faceted gems and pixel highlights.
There is no blur or antialiasing. The larger E7 texture retains the existing
codepoint positions; the client still controls on-screen font size. A 64px source
cell does not force a 64px-tall chat line. Chat retains ordinary
readable rank text and existing icon/text/hidden preferences. Name tags, menu text and sidebar use readable rank labels without E5 badges. Custom text prefixes remain supported; retired E5 glyphs are stripped.
Menu icons and chat artwork are half their v1.8.74 width/height; label-strip source art remains available at full detail.

Saved roles using removed styles display the Member badge. Unedited legacy
MVP/Legend/Helper prefixes also display Member. Saved role IDs, assignments,
priorities, homes and permissions are not rewritten or deleted. Fresh worlds use
all ten defaults. Installing missing decorative presets never
grants admin access or changes existing roles.

Activate both packs and reload resources/world. Native Bedrock rendering needs
target-device confirmation; browser PNG previews cannot establish game font metrics.

## Chat font compatibility (v1.8.57)

The HUD `chat_label` uses the `default` bitmap font. The classic chat history
sets `$chat_font_type` to `default` on `chat.messages_text`, so its existing
child label reads the same bitmap glyph pages. Font scale and line spacing still
follow the player's chat settings. Other UI fonts are unchanged.

Import both updated v1.8.76 packs, activate the resource pack for every recipient,
and reload the world/resources. Place it above packs that replace chat UI or
`font/glyph_E7.png`. The E7 page contains all ten chat badges at the codepoints
in `rank-tags.js`; the retired E5 rank cells are empty.

These JSON UI overrides apply to classic Bedrock chat. Ore UI clients that do not
use JSON UI chat cannot be forced to render bitmap glyphs by a script. For those
clients, use Ranks > Chat Rank Display > Colored text. This retains readable rank
names without sending unsupported custom glyphs. Text and Hidden preferences
and saved role permissions are preserved by this update.

Verify on the target Minecraft device: send a message as each of the ten ranks,
check both the HUD and opened chat history, then check Colored text and Hidden.
Browser images and static asset checks cannot verify native chat rendering.

## Build and asset verification

```sh
python3 -m venv /tmp/essx-rank-art
/tmp/essx-rank-art/bin/pip install -r tools/rank-art-requirements.txt
/tmp/essx-rank-art/bin/python tools/build-rank-icons.py
/tmp/essx-rank-art/bin/python tests/rank-icons.test.py
```

The generator uses a fixed 64px drawing grid and fixed palettes/bitmap alphabet,
without system fonts or random texture noise. Rebuilding creates the ten icons,
matching label strips and E7 atlas. E5 clears only the ten rank cells; all other E5 pixels and E6 stay unchanged.
Asset tests verify exact icon-to-glyph correspondence, empty unused cells, hard
alpha, distinct artwork, preserved non-rank font pixels and deterministic rebuilding.
Check all ten ranks on the target device in both HUD and chat history; confirm
textures stay sharp at the player's preferred chat size and text/hidden modes work.
Native support for the larger atlas requires that device check.

## Consistent assigned ranks (v1.8.69)

Rank Tags, the EssentialsX menu, live nametags and the personal sidebar resolve
the highest-priority assigned role and its saved style through the same formatter.
Chat uses that style's label/color too (including Member gray and Admin red),
while preserving icon/text/hidden modes. Legacy built-in role previews, assignment
labels and editor selection resolve their role ID exactly as the player display
does. A stale embedded role ID cannot override the saved role key.

Assign ranks under Ranks > Assign Rank; select decorative styles under Edit Rank.
The gallery is a preview. A style changes appearance only. Multiple assignments
still show the role with the highest priority. The sidebar refreshes every second;
reopen an already-open menu to see a changed assignment. Assignments, priorities,
home limits, staff permissions and manual admin tags are preserved.

Run `node --test tests/rank-display.test.mjs` for all ten assignments, saved
styles, legacy roles, default/multiple ranks and actual menu/sidebar/nametag consumers.

## Facebook, Roblox and Telegram (v1.8.70)

The Social collection adds `facebook`, `roblox` and `telegram`. Retired compact codepoints E530/E531/E532 are reserved and transparent; chat glyphs use E730/E731/E732. The social chat and menu artwork remains available.

The first rank lookup after upgrading adds missing social roles to an existing world
and persists `socialRanksVersion: 1`. Existing definitions using these IDs win;
assignments are never changed. Later manual deletions stay deleted. Resetting the
configuration also resets the upgrade marker; missing social roles are then added
on the next lookup. Use **Ranks > Assign Rank** to give a player a social rank, or
**Edit Rank > Social** to use its appearance on another role.

New social roles have priority 1, three homes, no staff access and are not defaults.
They display above Member (0) and below VIP (10) and staff roles. Administrators can
edit these settings. The explicit Add Missing Preset Ranks action retains its
existing safe defaults (priority 0, three homes, no staff access).

## Compact badge removal (v1.8.76)

The E5 badges shown enlarged 4× in the previous comparison are removed from
name tags, menu text, rank previews, sidebars and player hologram rows. Their ten
texture cells are cleared, and custom prefixes omit retired E5 glyphs. An explicit
empty sidebar badge no longer falls back to the generic rank icon.

Rank names still follow the assigned role and saved style everywhere. Role IDs,
priorities, permissions and home limits are preserved. E7 chat badges and menu
button images remain unchanged from v1.8.75. Activate both v1.8.76 packs and reload
world/resources. Native rendering still requires target-device confirmation.

## Assigned menu and sidebar badges (v1.8.81)

The EssentialsX welcome row and personal sidebar RANK value now show only the
compact E7 badge of the highest-priority assigned role and its saved style,
replacing the text rank name on these two displays. Reopen the menu after changing
an assignment; the live sidebar refreshes every second. Both labels explicitly
use the default bitmap font. Existing artwork, panel sizes and font scales stay
unchanged; the retired E5 cells remain empty.

Custom text-only roles keep their prefix; disabling `rankTagIcons` explicitly
uses text. Chat text/hidden preferences affect chat only. Nametags, holograms,
role permissions, home limits and assignments retain their prior behavior.
Activate both v1.8.81 packs and reload resources. Native glyph appearance still
needs verification in Minecraft.

## Overhead nametag badges (v1.8.83)

Rank Nametags now shows a compact E7 badge before the bracketed rank label and
player name, for example: silver Member badge + `[MEMBER] Yatogojin`. This
supersedes the earlier text-only overhead display. It follows the highest-priority
assigned role and saved decorative style. The ten existing compact sprites are
reused without enlarging them or restoring E5 cells.

Custom text-only ranks keep their original text. The global `rankTagIcons` false
setting omits the badge while retaining the label; chat text/hidden preferences
affect chat only. Nicknames, clans, health lines (including the small HP number),
vanish and cleanup remain intact. Menu and sidebar keep their icon-only rank
values. Both v1.8.83 packs must be active; reload world/resources. Native nametag
size and font rendering require target-device verification.

## Labeled menu and sidebar badges (v1.8.85)

The menu welcome line and personal sidebar RANK value now show a compact icon
plus its colored rank name, for example the silver shield followed by `MEMBER`.
This supersedes the earlier icon-only values on those two displays. All ten
assigned roles and saved styles share the same resolver; defaults display Member,
while higher-priority assignments retain their own badge and label. No role is
reassigned by this display update.

Custom text-only roles and explicit global icon opt-outs retain their existing
text fallback. Chat visibility preferences remain independent. Nametag/health
formatting, resource art, background selections, permissions and home limits stay
unchanged. Activate both v1.8.85 packs and reload the world/resources, then reopen
the menu. Native rendering requires verification in Minecraft.
