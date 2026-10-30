// Pure game rules. Multipliers are total returns, including the original stake.
export const SLOT_SYMBOLS = ["Apple", "Gold", "Emerald", "Diamond", "Star"];
export const MAX_RETURN = { coinflip: 2, dice: 6, slots: 10 };

export function gameSettings(value = {}) {
  const limit = (number, fallback) => Number.isSafeInteger(Number(number)) ? Math.max(1, Math.min(1000000, Number(number))) : fallback;
  const minBet = limit(value.minBet, 10);
  return {
    minBet, maxBet: Math.max(minBet, limit(value.maxBet, 10000)),
    cooldownSec: Number.isFinite(Number(value.cooldownSec)) ? Math.max(0, Math.min(60, Math.floor(Number(value.cooldownSec)))) : 3,
    coinflip: value.coinflip !== false, dice: value.dice !== false, slots: value.slots !== false,
  };
}

export function parseBet(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return undefined;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

export function resolveGame(game, choice, random = Math.random) {
  const roll = count => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid random result.");
    return Math.floor(value * count);
  };
  if (game === "coinflip") {
    if (choice !== "heads" && choice !== "tails") throw new Error("Choose heads or tails.");
    const face = roll(2) === 0 ? "heads" : "tails";
    return { detail: `Coin: ${face === "heads" ? "Heads" : "Tails"}`, multiplier: face === choice ? 2 : 0 };
  }
  if (game === "dice") {
    if (!Number.isInteger(choice) || choice < 1 || choice > 6) throw new Error("Choose a number from 1 to 6.");
    const face = roll(6) + 1;
    return { detail: `Dice: ${face} | Your pick: ${choice}`, multiplier: face === choice ? 6 : 0 };
  }
  if (game === "slots") {
    const reels = Array.from({ length: 3 }, () => roll(SLOT_SYMBOLS.length));
    const count = new Set(reels).size;
    return { detail: reels.map(index => SLOT_SYMBOLS[index]).join(" | "), multiplier: count === 1 ? 10 : count === 2 ? 1 : 0 };
  }
  throw new Error("Unknown game.");
}
