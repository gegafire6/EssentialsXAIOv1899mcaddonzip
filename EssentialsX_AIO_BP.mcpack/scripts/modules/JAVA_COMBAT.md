# Blurry Java Combat

Open `!plugins` (admin) → **Blurry Java Combat** → **Enable Plugin**.
New and existing worlds start with this optional plugin disabled. Settings persist
through the existing plugin configuration system.

- Swords recharge at 1.6 attacks/second; axes, pickaxes, shovels, hoes, tridents
  and unarmed attacks use their own Java-inspired attack speeds.
- Early attacks scale the original melee damage using `0.2 + 0.8 × charge²`.
  Waiting for a full charge restores full Bedrock damage.
- Missed attack swings consume charge. Mining and interaction swings do not.
- Changing weapon type resets charge, preventing a fast weapon from charging an axe.
- An optional actionbar meter displays recharge, yielding to other gameplay notices.
- Admins can adjust cooldown duration from 25–200% and independently enable
  cooldown damage for PvP and mobs. Creative and Spectator attackers are excluded.

This is an original Java-inspired timing feature for this add-on. It does not
bundle an external combat plugin. Bedrock base damage, armor, enchantments,
critical hits, shields and knockback remain native; Java sweeping attacks and
shield disabling are not implemented. The cooldown scales the whole incoming
melee damage, including any enchantment contribution, rather than separating
Java base and enchantment damage.

Requires the manifest's `@minecraft/server` beta API and a compatible Minecraft
host exposing `beforeEvents.entityHurt` with writable damage and
`afterEvents.playerSwingStart`. Enable **Beta APIs** in world experiments.
The plugin warns and stays inactive if either event is unavailable.
Projectiles, thorns and environmental damage are unchanged. Existing login,
region, claim and clan handlers still cancel the original damage event; this
plugin never re-applies cancelled damage or performs synthetic hits.

API references:
- [EntityHurtBeforeEvent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityhurtbeforeevent?view=minecraft-bedrock-experimental)
- [PlayerSwingStartAfterEvent](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/playerswingstartafterevent?view=minecraft-bedrock-experimental)
- [EntitySwingSource](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entityswingsource?view=minecraft-bedrock-experimental)

Run automated checks from the repository root:

```sh
node --experimental-vm-modules --test tests/java-combat.test.mjs
```

The tests exercise timing and event integration with a mocked Minecraft API.
In-game validation still requires a Minecraft Bedrock client/server: check
charged and rapid attacks, missed swings, weapon changes, protected targets,
plugin toggles, PvP/PvE toggles, and the charge indicator alongside the sidebar.
