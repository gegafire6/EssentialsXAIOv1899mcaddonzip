<!-- coderabbit-ai-generated:v1 -->

# Land claims

Open **Essentials Menu → Land & Clans → Land Claims**, or use `!land` (replace `!` with the server's configured prefix). Claim a centered square area or the 16×16 chunk containing your position. Chunk claims still obey the configured size and claim-count limits and cannot overlap another claim or a region that disallows claims. Existing claims and their trust lists are retained.

The menu displays the number of claims used, remaining claim slots, prepaid block credit and current price. **My Claim List** opens each claim's details and lets an owner, trusted player or admin teleport there. Teleport uses the usual restrictions and warmup and requires safe, loaded ground in the claim's dimension. Claim Info shows owner, creation date when available, bounds, trusted players and flags. Owners and admins can trust and untrust players, change flags or unclaim; unclaim keeps the existing 50% refund. A transfer is refused when the recipient has reached their claim limit.

## Prepaid claim blocks

Buy blocks with the server's Economy balance at the current configured per-block price. These are prepaid credits toward future claim costs, not additional claim slots or an area quota. When claiming, the oldest credits are used first and the remaining area is charged at the current price. The refundable claim price includes the actual price paid for consumed credits and the cash charged at claim time. Buying requires Land and Economy enabled, a nonnegative whole-number per-block price, and enough balance. A player can hold at most 1,000,000 credits. The current claim-count, size, overlap and region rules still apply.

## Permissions and flags

- Trusted players may build and interact. Public interact, when on, also allows visitors to use containers, as in earlier versions; leave it off to keep chests private.
- PvP is off by default. Existing region, clan and other combat restrictions still apply when it is enabled. This requires the Bedrock before-hurt event.
- Explosions are off by default, including for existing claims with no explosion flag. Impacted claim blocks remain protected. When the source is identifiable inside a protected claim the explosion itself is cancelled; explosion damage inside protected claims is also cancelled where the before-hurt event is available. A protected region's build flag still takes precedence.
- Natural monster spawns are on by default. Switching them off removes newly spawned natural monsters in the claim after the spawn event; it does not delete mobs already there, loaded mobs, animals, or EssX entities. Other spawn causes are not blocked.

Commands: `!land claim [size]`, `!land chunk`, `!land unclaim`, `!land info`, `!land trust <player>`, `!land untrust <player>`, `!land show`, and `!land buy <blocks>`. Player names containing spaces should be quoted. Native Bedrock event handling, explosion and mob behavior, terrain safety, and forms still require testing in a compatible Bedrock world.
