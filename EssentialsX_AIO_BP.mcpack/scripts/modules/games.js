// EssentialsX AIO - By Opiar | House games using the existing in-game economy.
import { world } from "@minecraft/server";
import { cfg, mod } from "../core/config.js";
import { cmd, addMember, hooks } from "../core/commands.js";
import { menu, modal, msg, err, cur, now, log, sound } from "../core/utils.js";
import { registerPlugin } from "../core/plugins.js";
import { gameSettings, parseBet, resolveGame, MAX_RETURN } from "../core/games.js";
import { bal, takeBal, addBal, setBal } from "./economy.js";

const GAMES = {
  coinflip: { name: "Coinflip", icon: "textures/ui/essx/icons/coinflip", rules: "Choose Heads or Tails. Match the coin to receive 2x your bet (50% chance).", choices: ["Heads", "Tails"] },
  dice: { name: "Dice", icon: "textures/ui/essx/icons/dice", rules: "Choose 1-6. Match the roll to receive 6x your bet (1 in 6 chance).", choices: ["1", "2", "3", "4", "5", "6"] },
  slots: { name: "Slots", icon: "textures/ui/essx/icons/slots", rules: "3 reels, 5 equally likely symbols. Triple: 10x (4%). Pair: 1x, stake returned (48%). All different: lose (48%)." },
};
const pending = new Map();
const lastRound = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => { pending.delete(playerId); lastRound.delete(playerId); });

function allowed(p, game) {
  if (!p.isValid) return false;
  if (!mod("games") || !mod("economy")) { err(p, "Games and Economy must be enabled to play."); return false; }
  if (game && !gameSettings(cfg().games)[game]) { err(p, "This game is disabled."); return false; }
  for (const hook of hooks.beforeCommand) {
    const reason = hook(p, { name: game ?? "games", module: "games" }, []);
    if (reason) { err(p, reason); return false; }
  }
  return true;
}

function settle(p, game, rawBet, choice) {
  if (!allowed(p, game)) return;
  const settings = gameSettings(cfg().games), bet = parseBet(rawBet);
  if (!bet || bet < settings.minBet || bet > settings.maxBet) return err(p, `Enter a whole-number bet from ${cur(settings.minBet)} to ${cur(settings.maxBet)}.`);
  const last = lastRound.get(p.id);
  const remaining = last === undefined ? 0 : last + settings.cooldownSec * 1000 - now();
  if (remaining > 0) return err(p, `Wait ${Math.ceil(remaining / 1000)}s before playing again.`);
  const balance = bal(p.id);
  if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(balance - bet + bet * MAX_RETURN[game])) return err(p, "Your balance is outside the supported range for this bet.");
  if (balance < bet) return err(p, "Not enough money for this bet.");
  let outcome;
  try { outcome = resolveGame(game, choice); }
  catch (e) { err(p, e.message); return; }
  const payout = bet * outcome.multiplier;
  try {
    if (!takeBal(p.id, bet)) return err(p, "Not enough money for this bet.");
    if (payout) addBal(p.id, payout);
  } catch (e) {
    // No await between debit and credit: restore this round's original balance on failure.
    try { setBal(p.id, balance); } catch (restoreError) { console.warn("[EssX] Game balance restore failed: " + restoreError); }
    err(p, "The game could not be settled. Please check your balance.");
    console.warn("[EssX] Game settlement failed: " + e);
    return;
  }
  lastRound.set(p.id, now());
  const result = { ...outcome, bet, payout, balance: bal(p.id) };
  const verdict = payout > bet ? "§aYou won!" : payout === bet ? "§eStake returned." : "§cYou lost.";
  result.body = `${verdict}\n§f${outcome.detail}\n\n§7Bet: §e${cur(bet)}\n§7Total return: §a${cur(payout)}\n§7Balance: §b${cur(result.balance)}`;
  msg(p, `${GAMES[game].name}: ${verdict} §r§7${outcome.detail} §8| §7Return: §e${cur(payout)} §7(includes stake)`);
  sound(p, payout > bet ? "random.levelup" : payout === bet ? "random.orb" : "note.bass");
  try { log("games", `${p.name} ${game}: bet=${bet}, return=${payout}, balance=${result.balance}; ${outcome.detail}`); } catch {}
  return result;
}

async function playGame(p, game, args = []) {
  const definition = GAMES[game];
  while (true) {
    if (!allowed(p, game)) return;
    if (pending.has(p.id)) return err(p, "Finish your current game form first.");
    const token = {};
    pending.set(p.id, token);
    let result;
    try {
      let bet, choice;
      if (args.length) {
        const expected = game === "slots" ? 1 : 2;
        if (args.length !== expected) return err(p, `Usage: ${cfg().prefix}${game} <bet>${game === "coinflip" ? " <heads|tails>" : game === "dice" ? " <1-6>" : ""}`);
        bet = args[0];
        choice = game === "coinflip" ? args[1].toLowerCase() : game === "dice" && /^[1-6]$/.test(args[1]) ? Number(args[1]) : undefined;
      } else {
        const settings = gameSettings(cfg().games);
        const fields = [
          { type: "label", label: `§7${definition.rules}\n§7All payouts include your stake.\n§7Bet limits: ${cur(settings.minBet)} - ${cur(settings.maxBet)}\n§7Balance: ${cur(bal(p.id))}` },
          { type: "text", key: "bet", label: "Bet amount", default: settings.minBet, placeholder: String(settings.minBet) },
        ];
        if (definition.choices) fields.push({ type: "dropdown", key: "choice", label: "Your pick", options: definition.choices, default: 0 });
        const response = await modal(p, "§l" + definition.name, fields, "Play");
        if (!response) return;
        bet = response.bet;
        choice = game === "coinflip" ? ["heads", "tails"][response.choice] : game === "dice" ? response.choice + 1 : undefined;
      }
      if (!p.isValid || pending.get(p.id) !== token) return;
      result = settle(p, game, bet, choice);
    } finally { if (pending.get(p.id) === token) pending.delete(p.id); }
    if (!result || !p.isValid) return;
    const next = await menu(p, "§l" + definition.name + " Result", result.body, [
      { text: "§lPlay Again", icon: definition.icon, again: true },
      { text: "§lBack", icon: "textures/ui/essx/icons/back" },
    ]);
    if (!next?.again) return;
    args = [];
  }
}

export async function gamesUI(p) {
  if (!allowed(p)) return;
  const settings = gameSettings(cfg().games);
  const buttons = Object.entries(GAMES).filter(([id]) => settings[id]).map(([id, game]) => ({
    text: "§l" + game.name + "\n§r§7" + (id === "coinflip" ? "Heads or Tails" : id === "dice" ? "Pick a number, roll to win" : "Spin three reels"),
    icon: game.icon, run: () => playGame(p, id),
  }));
  if (!buttons.length) return err(p, "All games are currently disabled.");
  await menu(p, "§lGames", `§7Balance: §a${cur(bal(p.id))}\n§7Play against the house with in-game money.`, buttons);
}
cmd({ name: "games", aliases: ["game"], module: "games", desc: "Coinflip, Dice and Slots", run: gamesUI });
for (const id of Object.keys(GAMES)) cmd({ name: id, aliases: id === "slots" ? ["slot"] : [], module: "games", desc: GAMES[id].name + " game", usage: "[bet]" + (id === "coinflip" ? " [heads|tails]" : id === "dice" ? " [1-6]" : ""), run: (p, args) => playGame(p, id, args) });
addMember({ text: "§l§6Games\n§r§8Coinflip, Dice & Slots", icon: "textures/ui/essx/icons/games", module: "games", run: gamesUI });
registerPlugin({
  id: "games", name: "Games", module: "games", icon: "textures/ui/essx/icons/games",
  desc: "House games using in-game money. Configure wager limits and individual games.",
  fields: c => {
    const settings = gameSettings(c.games);
    return [
      { type: "toggle", key: "coinflip", label: "Enable Coinflip", default: settings.coinflip },
      { type: "toggle", key: "dice", label: "Enable Dice", default: settings.dice },
      { type: "toggle", key: "slots", label: "Enable Slots", default: settings.slots },
      { type: "text", key: "minBet", label: "Minimum bet (1-1,000,000)", default: settings.minBet },
      { type: "text", key: "maxBet", label: "Maximum bet (at least minimum, up to 1,000,000)", default: settings.maxBet },
      { type: "slider", key: "cooldownSec", label: "Seconds between games", min: 0, max: 60, default: settings.cooldownSec },
    ];
  },
  apply: (c, response) => { c.games = gameSettings({ ...c.games, ...response }); },
});
