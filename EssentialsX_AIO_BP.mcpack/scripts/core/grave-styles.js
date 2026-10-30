// Variant order must match the grave entity events and resource-pack render controller.
export const GRAVE_STYLES = [
  { id: "gravestone", label: "Gravestone", description: "Flat stone grave with an engraved cross", variant: 0 },
  { id: "skeleton", label: "Skeleton", description: "Skeleton lying on its back", variant: 1 },
  { id: "coffin", label: "Ataol / Coffin", description: "Wooden coffin lying flat", variant: 2 },
  { id: "cross", label: "Cruz / Cross", description: "Wooden cross lying flat with brass details", variant: 3, icon: "textures/ui/essx/icons/grave_cross" },
];
export function graveStyle(id) {
  return GRAVE_STYLES.find(style => style.id === id) ?? GRAVE_STYLES[0];
}
