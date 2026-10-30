# Shop GUI (v1.8.65)

Activate both EssentialsX packs. Open `!shop` or Shop in the main menu.

- Select a category on the left; tap an item slot on the right to open the detailed item view.
- Five categories and fifteen items fit on one page. Categories cycles through category pages; Previous/Next change the selected category's item page.
- The header shows the selected category and your current balance. Each item shows its purchase price and bundle size. The detail view shows both prices, owned items and balance.
- Sell Items opens the existing hand/inventory selling menu. List View opens the previous category/item lists. Back or Close exits the shop.
- Empty slots do nothing. Saved categories, custom items, prices, auctions and admin editing retain their existing data format.

The resource pack routes only the dedicated `§0§r§2§r` shop title to this grid. Other forms keep their existing skin. `tools/build-shop-ui.py` reproducibly generates the grid and six small pixel bevel textures. Each native collection cell has an explicit row/column; filler buttons preserve the ActionForm selection indices.

Automated tests cover payload indices, navigation and existing transactions. The browser asset preview is a layout simulation. Native Bedrock scaling, touch/controller focus and scrolling still need verification in Minecraft.

## Detailed item view (v1.8.65)

- Separate Buy Items and Sell Items buttons replace the shared action dropdown. Unsellable items show that status and omit Sell. Back to Shop returns to browsing.
- Buy is priced per **bundle**, using the saved amount; Sell is priced per **individual item**. Buying 4 bundles of 16 gives 64 items. No existing price, bundle size or saved data format changes.
- Quick quantity buttons show item counts and totals. Only affordable/owned quantities appear; the largest available quantity is included, up to the existing limit of 64 bundles when buying or 64 items when selling. Free purchases retain that limit.
- Custom Quantity accepts a whole number. A separate review shows the exact item count, total and estimated balance after the transaction. Change Quantity returns to selection. Payment occurs only after Confirm Buy/Sell.
- Completed trades refresh the detail view with current ownership and balance. Full inventories retain the existing behavior: overflow drops at the player's feet, explained before purchase.
- Offers edited or removed while a form is open require reopening. Balance and owned quantity are checked before committing; unavailable item stacks are rejected before payment. Custom names, lore and enchantments still use the existing deserializer.

Run `node --test tests/shop-details.test.mjs` for mocked form navigation and transaction checks. Native Bedrock appearance and touch/controller behavior still require in-game verification.
