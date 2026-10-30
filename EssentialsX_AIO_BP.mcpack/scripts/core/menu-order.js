// Sort visible feature headings, ignoring Minecraft formatting and subtitles.
const heading = text => String(text ?? "").replace(/§./g, "").split(/\r?\n/, 1)[0].trim();
export function alphabeticalMenu(entries, label = entry => entry.text) {
  return [...entries].sort((a, b) => {
    // Navigation stays below the feature list.
    const backA = !a.run && heading(label(a)).toLowerCase() === "back";
    const backB = !b.run && heading(label(b)).toLowerCase() === "back";
    return Number(backA) - Number(backB) || heading(label(a)).localeCompare(heading(label(b)), "en", { sensitivity: "base" });
  });
}
