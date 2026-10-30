<!-- coderabbit-ai-generated:v1 -->

# Warps

Open **Warps** from Essentials Menu or use `!warps`. Server warps, player warps, favorites and categories are available from this menu. Select a warp to see its price and teleport or toggle its favorite status. Favorites are filtered by current access and removed when the warp is deleted.

## Player warps

VIP rank and staff can create a personal warp through **My Warps**. The default allowance is one free slot; additional slots cost 1,000 server currency each, up to 10 total. A developer-authenticated admin can change these settings in **Warp Manager → Player Warp Slot Settings**. Creating or moving a warp requires build access at a safe, loaded position. Owners retain management access after losing VIP status but cannot create or buy slots until eligible again.

Owners can edit a warp's name, category, cost and privacy, move or delete it, and manage trusted online players. Public warps are available to everyone; private warps only to their owner; trusted warps to their owner and listed players. Trust remains until removed. Categories are Other, Shops, Towns, Farms and Minigames.

`!pwarp` opens My Warps. `!pwarp go <online player name> <warp ID>` visits a personal warp if its privacy permits; menus also list accessible warps whose owners are offline. IDs contain 1–24 letters, digits, underscores or hyphens.

## Server warps and charges

Existing server warps and `!warp <name>` remain available. Staff use the developer-authenticated Warp Manager, `!setwarp` and `!delwarp` for server warps. Hidden server warps are accessible only to admins, including through direct commands.

The displayed price is paid to the server, not the warp owner. The owner and admins teleport free. Charges occur immediately before teleport and are refunded if the teleport throws. Paid personal warps require Economy to be enabled. The normal teleport warmup and restrictions apply; access is rechecked after warmup and terrain loading. Personal warp destinations must have solid safe ground and two clear blocks, and distant terrain may need a temporary ticking area.
