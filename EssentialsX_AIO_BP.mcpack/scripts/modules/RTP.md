# Progressive Random TP

Use `!rtp`, `!wild`, `!randomtp`, or **Main Menu → Teleport → Random TP**.
The first default destination is **20–30 horizontal blocks from the player's
position when their first successful search begins**. That position becomes their
saved RTP origin. Each subsequent successful RTP adds another **20–30 blocks** to
the last landing's horizontal distance from that same origin, so it always moves
farther out rather than returning to a prior landing. For example, a landing at
25 blocks makes the next range 45–55 blocks; a landing at 50 makes it 70–80.
Progress is separate per player and survives rejoining or script reloads.
Failed/canceled searches do not advance it. Terrain determines Y; the player always needs solid,
non-hazardous ground and two clear blocks of headroom. The final block-center
position must remain inside the configured distance range.

## Admin configuration

Open **Admin Panel → Teleport & Random TP**, or use `!rtpsettings`.
The same form remains under **Server Settings → Teleport & RTP**.
Existing admin and developer authentication is required, including rechecking
access before saving.

- **Origin:** player's position on their first successful use (default), or
  world/server spawn. Changing the origin mode resets progression on the next
  success. Moving the server spawn also starts a new spawn-based progression.
- **Minimum / maximum distance:** whole blocks, 1–5000; maximum must exceed minimum.
  These are distance increments per successful trip, rather than an absolute
  radius cap. Use 20 and 30 for small outward steps. Customized ranges are supported.
- **Cooldown:** 0–86400 seconds; 0 disables it. Admins retain their exemption.
- **Cost:** whole amount, 0–1000000000; 0 means free. Admins retain their exemption.
- **Other teleport warmup, TPA timeout and home limit:** existing settings remain
  in this form. RTP itself starts its terrain search immediately.

Upgrading an old untouched 300–5000 preset without an origin switches it to
20–30 blocks. Existing custom radii and explicitly selected origins are retained;
legacy settings without an origin now default to measuring from the player.
Invalid or canceled form submissions do not save any fields.

RTP remains Overworld-only. Movement, death, logout, dimension change, disabling
RTP or a teleport restriction cancels a pending search. At most eight candidates
are tried. Unloaded candidates temporarily load through a ticking area, which
is removed after success or failure. If no safe destination is found, no teleport
or successful-use cooldown is applied and any charged fee is refunded.
