# Main menu organization

The main menu groups enabled member features in this order:

| Category | Feature order |
| --- | --- |
| Teleport | Spawn, Homes, Warps, TPA, Random TP, Graves |
| Land & Clans | Land Claims, Clan |
| Economy & Trading | Money, Jobs, Shop, Auction House, Player Trade, Repair Tools, Enchant Item |
| Rewards & Quests | Daily Reward, Daily Quests, Kits, Redeem Code |
| Games & Combat | Games, Duel Arena, Combat Bounty |
| Cosmetics | Hats, wings and particle effects |
| Community Hub | Server Info & Rules, Players & Profile, Leaderboards, Report, Night Vote |
| My Settings | Account, TPA, messages and ignore list |

Disabled modules disappear, and empty categories are hidden. A category with a
single enabled feature opens it directly. Multi-feature categories use the existing
Back navigation. Feature handlers, permissions and commands remain the same.

`menu.js` defines category and feature order by module ID. Registrations may supply
`category` to override placement and numeric `order` to override feature order.
Lower orders appear first; ties keep registration order. Community utilities use
negative orders before Report and Night Vote. Unknown modules or category IDs stay
reachable at the end of Community Hub. Labels and translations do not affect routing.

Regression check (mock Minecraft menu API; native rendering still needs a game):

```sh
node --experimental-vm-modules --test tests/menu.test.mjs
```

## Admin menu order (v1.8.61)

Admin Panel entries and the feature lists in Server Settings, Plugins, plugin
pages, Bans, Player Manager actions, Self Tools, World Tools and Server Logs
are sorted A–Z by the visible first line. Minecraft colors, bold/reset codes,
and description/status lines do not affect ordering. Equal headings retain their
registration order. Back stays last. Core module toggles are also sorted by their
visible labels, with keys preserved for saving.

Sorting uses copies of the button lists and keeps the original handlers, icons,
module visibility, admin checks and developer authentication. Member categories
and feature order continue to follow the table above. Inventory slots, log record
chronology, announcement messages and configuration field groups retain their
existing data order.

## Menu Name and message tag (v1.8.68)

Open **Admin Menu → Menu Name** to edit the shared menu heading and the message
tag shown as `[EssX]` in system chat. These are separate saved fields:
`menuName` controls the existing shared heading; `messageTag` controls the text
inside the gray brackets. Cyan is the default text color, and `§` colors are
supported. Enter the tag text without brackets. Each field accepts 1–24 visible
characters on a single line. Empty/color-only names and multiline values are
rejected before either field is saved.

The existing developer authentication still protects saving. Canceling or failed
authentication changes neither value. The new tag is used immediately by standard
messages, success/error notices and the admin reload notice; the saved heading
appears when reopening a shared menu. Existing worlds receive `EssX` as the default
tag. Later saved custom tags persist across reloads.

Run `node --test tests/menu-message-tag.test.mjs` for the setting/save/formatting
regression checks. Native Bedrock form appearance still needs in-game verification.
