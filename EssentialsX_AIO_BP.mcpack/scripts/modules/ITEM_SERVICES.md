# Repair Tools and Enchant Item (v1.8.62)

Open **Essentials Menu → Economy & Trading → Repair Tools / Enchant Item**.
Commands: `!repairtools` and `!enchantitem`. Both modules are enabled by default,
require Economy and a logged-in player, and pause while a trade or duel is active.

## Repair

Choose the held item or entire inventory. Whole-inventory repair includes equipped
armor and offhand, without counting mainhand twice. Only damaged items with a
native durability component are charged: **$100 per repaired item** by default.
The confirmation shows count, per-item price, total and current balance. Items
keep their enchantments, names, lore, dynamic properties and other native data.
Each successful slot update is charged; failed updates are refunded individually.
If part of a whole-inventory repair fails, completed repairs remain paid and the
result reports the completed count and amount actually spent.

The existing admin-only `!repair` / `!fix` command is unchanged.

## Enchant

Hold an enchantable item, choose any registered enchantment, and enter a whole
level from 1 to that enchantment's native maximum. Review the exact price before
confirming: **$250 × chosen level** by default (including upgrades). Incompatible
item/enchantment combinations and same-level or weaker replacements are rejected
without payment. All enchantments exposed by `EnchantmentTypes.getAll()` are
listed alphabetically; available combinations and maximum levels follow the
Minecraft API. Forced incompatible enchantments and levels beyond those limits
are not supported. Existing unrelated enchantments and full item data are retained.

## Prices and transaction behavior

**Admin → Plugins → Repair Tools / Enchant Item → Configure Settings** controls
the price, from 1 to 100000 currency units. Plugin toggles enable each service.
Confirmation is required before payment. If the selected slot, item contents,
price, login, module settings or trade/duel activity changes while a form is open,
the purchase is rejected and requires a new quote. Insufficient balance does not
modify items; canceled forms cost nothing. Inventory writes and charges execute
without asynchronous waits, and failed writes refund their charge.

Run the simulated inventory/economy regression suite:

```sh
node --test tests/item-services.test.mjs
```

Native forms, enchanting compatibility and imports still need a Minecraft client
with both updated packs and the declared Beta APIs.
