// Visual wearables use native equipment slots; no armor stats or flight ability.
export const WEARABLES = [
  { id: "hat_tophat", name: "Top Hat", tier: "common", slot: "hat", equipment: "Head" },
  { id: "hat_wizard", name: "Wizard Hat", tier: "rare", slot: "hat", equipment: "Head" },
  { id: "hat_crown", name: "Royal Crown", tier: "legend", slot: "hat", equipment: "Head" },
  { id: "wings_angel", name: "Angel Wings", tier: "common", slot: "wings", equipment: "Chest" },
  { id: "wings_butterfly", name: "Butterfly Wings", tier: "rare", slot: "wings", equipment: "Chest" },
  { id: "wings_dragon", name: "Dragon Wings", tier: "vip", slot: "wings", equipment: "Chest" },
].map(w => ({ ...w, item: "essx:" + w.id, icon: `textures/items/essx_${w.id}` }));
export const wearableByItem = id => WEARABLES.find(w => w.item === id);
