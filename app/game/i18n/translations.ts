/**
 * Centralized translation dictionary for the whole game (menu, multiplayer
 * lobby, HUD, credits) — the single source of truth other code reads
 * through `t(lang, key, params)`. Used both by React components (via the
 * `useT()` hook in LanguageContext.tsx) and directly by the plain-class
 * Engine (app/game/engine/Engine.ts), which has no access to React hooks.
 *
 * Only user-facing UI/HUD text lives here. Network protocol message types,
 * code identifiers, and internal state names are never translated.
 */

export type Language = "si" | "en";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "si", label: "සිංහල" },
  { code: "en", label: "English" },
];

const si = {
  // ---------------------------------------------------------------- menu
  "menu.level": "මට්ටම 0",
  "menu.title": "අඳුරු මංසන්ධිය",
  "menu.subtitle": "නිමක් නැති මාවතකින් පිටවීමක් සොයන්න.",
  "menu.lore":
    "ඔබ යථාර්ථයේ වැරදි කෙළවරකින් ලිස්සී වැටුණා, ලෝකය ඔබ පිටුපසින් සදහටම වැසී ගියා. කවුරුහරි මීට පෙර මෙහි සිටියා — ඔවුන් මෙම බිත්ති මත පිටු 8ක් අත්හැර ගියා. ඒවා සියල්ල එකතු කරගන්න, එවිට දොර පෙනී යනු ඇත. ආලෝකය නිවී යාමට පටන් ගත් විට, එය ඔබ ඇවිදින හඬ නොඇසෙන්න වගබලා ගන්න.",
  "menu.controls.touch1": "වම් ස්ටික් — ඇවිදින්න",
  "menu.controls.touch2": "දකුණු පැත්ත — බලන්න",
  "menu.controls.touch3": "ස්ටික් සම්පූර්ණයෙන් — දුවන්න",
  "menu.controls.touch4": "බොත්තම් — ටෝච් / සෙමින්",
  "menu.controls.wasd": "WASD — ඇවිදින්න",
  "menu.controls.mouse": "MOUSE — බලන්න",
  "menu.controls.shift": "SHIFT — දුවන්න",
  "menu.controls.crouch": "C — සෙමින් ගමන් කරන්න",
  "menu.controls.torch": "F — විදුලි පන්දම",
  "menu.controls.interact": "E — අන්තර්ක්‍රියා කරන්න",
  "menu.controls.pause": "ESC — විරාමය",
  "menu.singlePlayer": "තනි ක්‍රීඩාව",
  "menu.loading": "පටය පූරණය වෙමින්…",
  "menu.multiplayer": "බහු ක්‍රීඩක",
  "menu.credits": "නිර්මාණකරුවන්",
  "menu.headphonesHint": "හෙඩ්ෆෝන් පැළඳීම තදින්ම නිර්දේශ කරමු",
  "menu.developer": "Developer  හෂාන්",
  "menu.language": "භාෂාව",
  "menu.sound": "ශබ්දය",
  "sound.title": "ශබ්දය",
  "sound.music": "සංගීතය",
  "sound.effects": "ශබ්ද ප්‍රයෝග",
  "sound.back": "ආපසු",

  // ------------------------------------------------------------- credits
  "credits.title": "නිර්මාණකරුවන්",
  "credits.madeBy": "Hashanwickramasooriya විසින් නිර්මාණය කළ ක්‍රීඩාවකි",
  "credits.description":
    "මෙහි ඇති සෑම බිත්තියක්ම, වයනයක්ම, ශබ්දයක්ම සහ කෑගැසීමක්ම කේතය මගින් ජනනය කරන ලද්දකි. මෙහි කිසිදු සම්පත් ගොනුවක් නැත. මට්ටම් ගොනුවක්ද නැත. සෑම ධාවනයක්ම මීට පෙර කිසි විටෙකත් නොපැවති අලුත් මාදිලියක් තනයි.",
  "credits.builtWith": "තැනුවේ three.js · next.js · webaudio මගිනි",
  "credits.developer": "Developer  හෂාන්",
  "credits.back": "ආපසු",

  // ---------------------------------------------------------- mp: menu panel
  "mp.yourName": "ඔබගේ නම",
  "mp.namePlaceholder": "ක්‍රීඩකයා",
  "mp.createRoom": "කාමරයක් සාදන්න",
  "mp.connecting": "සම්බන්ධ වෙමින්…",
  "mp.or": "— හෝ —",
  "mp.roomCode": "කාමර කේතය",
  "mp.roomCodePlaceholder": "ABC123",
  "mp.join": "සම්බන්ධ වන්න",
  "mp.back": "ආපසු",
  "mp.connectError": "සම්බන්ධතාවය අසාර්ථක විය — multiplayer server එක ක්‍රියාත්මකද කියා පරීක්ෂා කරන්න",

  // ------------------------------------------------------------ mp: name entry
  "mp.nameEntry.roomLabel": "බහු ක්‍රීඩක කාමරය",
  "mp.nameEntry.title": "ඔබගේ නම",
  "mp.nameEntry.join": "කාමරයට සම්බන්ධ වන්න",

  // ---------------------------------------------------------------- mp: lobby
  "mp.connectingScreen": "සම්බන්ධ වෙමින්…",
  "mp.lobby.title": "බහු ක්‍රීඩක කාමරය",
  "mp.lobby.roomCode": "කාමර කේතය",
  "mp.lobby.inviteLink": "කාමර සබැඳිය",
  "mp.lobby.copyLink": "සබැඳිය පිටපත් කරන්න",
  "mp.lobby.copied": "පිටපත් විය",
  "mp.lobby.playerCount": "ක්‍රීඩකයින් {count}/4",
  "mp.lobby.host": "සත්කාරක",
  "mp.lobby.startGame": "ක්‍රීඩාව ආරම්භ කරන්න",
  "mp.lobby.minPlayers": "ක්‍රීඩාව ආරම්භ කිරීමට අවම වශයෙන් ක්‍රීඩකයින් දෙදෙනෙකු අවශ්‍යයි.",
  "mp.lobby.waitingHost": "සත්කාරකයා ආරම්භ කරනතුරු රැඳී සිටින්න",
  "mp.lobby.leaveRoom": "කාමරයෙන් ඉවත් වන්න",
  "mp.lobby.playerLeftToast": "ක්‍රීඩකයෙක් කාමරයෙන් ඉවත් විය",
  "mp.lobby.copyFailedToast": "පිටපත් කිරීම අසාර්ථක විය",

  // -------------------------------------------------------------- mp: errors
  "mp.error.full": "කාමරය පිරී ඇත.",
  "mp.error.alreadyStarted": "ක්‍රීඩාව දැනටමත් ආරම්භ වී ඇත",
  "mp.error.notFound": "කාමරය සොයාගත නොහැක",
  "mp.error.connectFailed": "multiplayer server එකට සම්බන්ධ විය නොහැක",
  "mp.error.backToMenu": "මෙනුවට ආපසු",

  // ------------------------------------------------------------- mp: playing
  "mp.matchEnded": "තරගය අවසන් විය",
  "mp.returnToLobby": "කාමරයට ආපසු යන්න",
  "mp.paused.subtitle": "අනෙක් ක්‍රීඩකයින් දිගටම ක්‍රීඩා කරති.",
  "mp.paused.resume": "නැවත ආරම්භ කරන්න",
  "mp.dead.title": "ඔබව රැගෙන ගියා",
  "mp.dead.spectating": "ඔබ දැන් නරඹන්නෙකි — අනෙක් ක්‍රීඩකයාව නරඹන්න",
  "mp.won.title": "ඔබ පිටතට පැමිණියා",
  "mp.won.subtitle": "පිටු 8ම එකතු විය",
  "mp.remoteDiedToast": "සගයෙක් ග්‍රහණය විය",

  // ----------------------------------------------------------------- hud
  "hud.objectiveCollect": "පිටු එකතු කරන්න — {count}/{total}",
  "hud.objectiveFindExit": "පිටවීමේ දොර සොයන්න",
  "hud.objectiveGo": "පිටතට යන්න",
  "hud.cheatsLabel": "වංචා ක්‍රම",
  "hud.sneakingIndicator": "— සෙමින් ගමන් කරමින් —",
  "hud.pages": "පිටු {count}/{total}",
  "hud.keyHints": "[F] ටෝච් {flashlight} · [SHIFT] දුවන්න · [C] සෙමින් {sneaking}",
  "hud.on": "ක්‍රියාත්මකයි",
  "hud.off": "නිෂ්ක්‍රියයි",
  "hud.banner.label": "අරමුණ",
  "hud.banner.pagesHint": "බිත්තිවල අලවා ඇත — ඒවා ගැනීමට [E] එබන්න",
  "hud.banner.pagesHintTouch": "බිත්තිවල අලවා ඇත — ළං වී 'පිටුව ලබා ගන්න' ඔබන්න",
  "hud.banner.findExitHint": "පිටු සියල්ල සොයා ගන්නා ලදී — කොහේ හරි දොරක් අගුළු ඇරී ඇත",
  "hud.banner.goExitHint": "දොර හරහා පිටවන්න — දුවන්න",

  // --------------------------------------------------------------- touch UI
  "touch.turnDevice": "ඔබේ උපාංගය හරවන්න",
  "touch.portraitOnly": "අඳුරු මංසන්ධිය පවතින්නේ තිරස් දිශාවේ පමණි",
  "touch.sneak": "සෙමින්",
  "touch.torch": "ටෝච්",

  // ---------------------------------------------------------------- paused
  "paused.title": "විරාමය",
  "paused.subtitle": "එය තවමත් එහි ඇත. එයට විරාමයක් නැත.",
  "paused.resume": "නැවත ආරම්භ කරන්න",
  "paused.resuming": "නැවත ආරම්භ වෙමින්…",
  "paused.exitToMenu": "මෙනුවට ඉවත් වන්න",
  "paused.footer": "ධාවනය නැතිවුණි. පිටු රැඳී පවතී.",

  // ------------------------------------------------------------------ dead
  "dead.title": "ඔබව රැගෙන ගියා",
  "dead.stats": "සොයාගත් පිටු — {pages}/8 · ජීවත්ව සිටි කාලය — {time}",
  "dead.footer": "අඳුරු මංසන්ධිය අල්ලාගත්තේ තබාගනියි.",
  "dead.retry": "නැවත අවදි වන්න",

  // ------------------------------------------------------------------- won
  "won.title": "ඔබ පිටතට පැමිණියා",
  "won.stats": "පිටු 8ම · පලා ගිය කාලය {time}",
  "won.footer": "…නැත්නම් ඔබ බිත්තිය හරහා මට්ටම 1ට රිංගුනාද?",
  "won.retry": "නැවත ඇතුළු වන්න",
  "won.starPrompt": "පැනගියාද? තරුවක් තියන්න",

  // ---------------------------------------------------------------- items
  "item.takePage": "පිටුව ලබා ගන්න",
  "item.drinkWater": "ඇල්මන්ඩ් වතුර පානය කරන්න",
  "item.pushDoor": "දොර තල්ලු කරන්න",
  "item.escape": "පලා යන්න",
  "item.locked": "අගුළු දමා ඇත — {count}/{total} පිටු",
  "item.waterRestored": "ශක්තිය යථා තත්ත්වයට පත් විය — හදවත සන්සුන් වෙයි",

  // ------------------------------------------------------------- dev cheats
  "cheat.sneakHint": "සෙමින් ගමන් [C] කරයි — CTRL අල්ලාගෙන නොසිටින්න, CTRL+W ටැබය වසයි",
  "cheat.unlocked": "වංචා ක්‍රම සක්‍රීය කරන ලදී — [G]අනභිභවනීය [N]බිත්ති හරහා [B]දීප්තිමත් [X]නවතන්න [M]සිතියම [P]පිටු [T]ටෙලිපෝට්",
  "cheat.god": "අනභිභවනීය ක්‍රමය {state}",
  "cheat.noclipOn": "බිත්ති හරහා ගමන සක්‍රීයයි — බිත්ති හරහා ගමන් කරන්න",
  "cheat.noclipOff": "බිත්ති හරහා ගමන අක්‍රීයයි",
  "cheat.fullbright": "සම්පූර්ණ ආලෝකය {state}",
  "cheat.freezeOn": "ආගන්තුකයා නවතන ලදී",
  "cheat.freezeOff": "ආගන්තුකයා නිදහස් කරන ලදී",
  "cheat.map": "සිතියම {state}",
  "cheat.grabbedPages": "පිටු ලබා දෙන ලදී (+{count}) — දොර සොයන්න",
  "cheat.teleportExit": "පිටවීමේ දොර වෙත ටෙලිපෝට් කරන ලදී",
  "cheat.on": "සක්‍රීයයි",
  "cheat.off": "අක්‍රීයයි",
  "cheat.label.god": "අනභිභවනීය",
  "cheat.label.noclip": "බිත්ති හරහා",
  "cheat.label.fullbright": "දීප්තිමත්",
  "cheat.label.freeze": "නවතන ලදී",
  "cheat.label.map": "සිතියම",
} as const;

type Key = keyof typeof si;

const en: Record<Key, string> = {
  // ---------------------------------------------------------------- menu
  "menu.level": "Level 0",
  "menu.title": "The Dark Intersection",
  "menu.subtitle": "Find a way out of a hallway that never ends.",
  "menu.lore":
    "You slipped out of reality at the wrong edge, and the world sealed shut behind you. Someone was here before — they left 8 pages scattered across these walls. Collect them all, and the door will reveal itself. When the lights start dying, make sure it doesn't hear you walk.",
  "menu.controls.touch1": "Left stick — walk",
  "menu.controls.touch2": "Right side — look",
  "menu.controls.touch3": "Full stick — sprint",
  "menu.controls.touch4": "Buttons — torch / sneak",
  "menu.controls.wasd": "WASD — walk",
  "menu.controls.mouse": "MOUSE — look",
  "menu.controls.shift": "SHIFT — sprint",
  "menu.controls.crouch": "C — sneak",
  "menu.controls.torch": "F — flashlight",
  "menu.controls.interact": "E — interact",
  "menu.controls.pause": "ESC — pause",
  "menu.singlePlayer": "Single Player",
  "menu.loading": "Loading reel…",
  "menu.multiplayer": "Multiplayer",
  "menu.credits": "Credits",
  "menu.headphonesHint": "Headphones strongly recommended",
  "menu.developer": "Developer  Hashan",
  "menu.language": "Language",
  "menu.sound": "Sound",
  "sound.title": "Sound",
  "sound.music": "Music",
  "sound.effects": "Effects",
  "sound.back": "Back",

  // ------------------------------------------------------------- credits
  "credits.title": "Credits",
  "credits.madeBy": "A game made by Hashanwickramasooriya",
  "credits.description":
    "Every wall, every texture, every sound and every scream here is generated by code. There are no asset files. There are no level files. Every run builds a layout that has never existed before.",
  "credits.builtWith": "Built with three.js · next.js · webaudio",
  "credits.developer": "Developer  Hashan",
  "credits.back": "Back",

  // ---------------------------------------------------------- mp: menu panel
  "mp.yourName": "Your name",
  "mp.namePlaceholder": "Survivor",
  "mp.createRoom": "Create Room",
  "mp.connecting": "Connecting…",
  "mp.or": "— or —",
  "mp.roomCode": "Room code",
  "mp.roomCodePlaceholder": "ABC123",
  "mp.join": "Join",
  "mp.back": "Back",
  "mp.connectError": "Connection failed — check that the multiplayer server is running",

  // ------------------------------------------------------------ mp: name entry
  "mp.nameEntry.roomLabel": "Multiplayer Room",
  "mp.nameEntry.title": "Your Name",
  "mp.nameEntry.join": "Join Room",

  // ---------------------------------------------------------------- mp: lobby
  "mp.connectingScreen": "Connecting…",
  "mp.lobby.title": "Multiplayer Room",
  "mp.lobby.roomCode": "Room Code",
  "mp.lobby.inviteLink": "Invite Link",
  "mp.lobby.copyLink": "Copy Link",
  "mp.lobby.copied": "Copied",
  "mp.lobby.playerCount": "Players {count}/4",
  "mp.lobby.host": "Host",
  "mp.lobby.startGame": "Start Game",
  "mp.lobby.minPlayers": "At least two players are needed to start.",
  "mp.lobby.waitingHost": "Waiting for the host to start…",
  "mp.lobby.leaveRoom": "Leave Room",
  "mp.lobby.playerLeftToast": "A player left the room",
  "mp.lobby.copyFailedToast": "Copy failed",

  // -------------------------------------------------------------- mp: errors
  "mp.error.full": "Room is full.",
  "mp.error.alreadyStarted": "The match has already started",
  "mp.error.notFound": "Room not found",
  "mp.error.connectFailed": "Could not connect to the multiplayer server",
  "mp.error.backToMenu": "Back to Menu",

  // ------------------------------------------------------------- mp: playing
  "mp.matchEnded": "Match ended",
  "mp.returnToLobby": "Return to Lobby",
  "mp.paused.subtitle": "The other players are still playing.",
  "mp.paused.resume": "Resume",
  "mp.dead.title": "It took you",
  "mp.dead.spectating": "You're spectating now — watch the other player",
  "mp.won.title": "You made it out",
  "mp.won.subtitle": "All 8 pages collected",
  "mp.remoteDiedToast": "A teammate was caught",

  // ----------------------------------------------------------------- hud
  "hud.objectiveCollect": "Collect the pages — {count}/{total}",
  "hud.objectiveFindExit": "Find the exit door",
  "hud.objectiveGo": "Get out",
  "hud.cheatsLabel": "Cheats",
  "hud.sneakingIndicator": "— sneaking —",
  "hud.pages": "Pages {count}/{total}",
  "hud.keyHints": "[F] Torch {flashlight} · [SHIFT] Sprint · [C] Sneak {sneaking}",
  "hud.on": "On",
  "hud.off": "Off",
  "hud.banner.label": "Objective",
  "hud.banner.pagesHint": "Pinned to the walls — press [E] to grab them",
  "hud.banner.pagesHintTouch": "Pinned to the walls — get close and tap 'Take Page'",
  "hud.banner.findExitHint": "All pages found — a door has unlocked somewhere",
  "hud.banner.goExitHint": "Get through the door — run",

  // --------------------------------------------------------------- touch UI
  "touch.turnDevice": "Rotate your device",
  "touch.portraitOnly": "The Dark Intersection only plays in landscape",
  "touch.sneak": "Sneak",
  "touch.torch": "Torch",

  // ---------------------------------------------------------------- paused
  "paused.title": "Paused",
  "paused.subtitle": "It's still out there. It doesn't pause.",
  "paused.resume": "Resume",
  "paused.resuming": "Resuming…",
  "paused.exitToMenu": "Exit to Menu",
  "paused.footer": "Your run is gone. Pages stay collected.",

  // ------------------------------------------------------------------ dead
  "dead.title": "It took you",
  "dead.stats": "Pages found — {pages}/8 · Time survived — {time}",
  "dead.footer": "The Dark Intersection doesn't let go once it has you.",
  "dead.retry": "Wake up again",

  // ------------------------------------------------------------------- won
  "won.title": "You made it out",
  "won.stats": "All 8 pages · Escape time {time}",
  "won.footer": "…or did you just crawl through the wall into Level 1?",
  "won.retry": "Go back in",
  "won.starPrompt": "Made it out? Leave a star",

  // ---------------------------------------------------------------- items
  "item.takePage": "Take page",
  "item.drinkWater": "Drink almond water",
  "item.pushDoor": "Push door",
  "item.escape": "Escape",
  "item.locked": "Locked — {count}/{total} pages",
  "item.waterRestored": "Stamina restored — your heart settles",

  // ------------------------------------------------------------- dev cheats
  "cheat.sneakHint": "Sneak is [C] — don't hold CTRL, CTRL+W closes the tab",
  "cheat.unlocked": "Cheats unlocked — [G]God [N]Noclip [B]Fullbright [X]Freeze [M]Map [P]Pages [T]Teleport",
  "cheat.god": "God mode {state}",
  "cheat.noclipOn": "Noclip on — walk through walls",
  "cheat.noclipOff": "Noclip off",
  "cheat.fullbright": "Fullbright {state}",
  "cheat.freezeOn": "Entity frozen",
  "cheat.freezeOff": "Entity released",
  "cheat.map": "Map {state}",
  "cheat.grabbedPages": "Pages granted (+{count}) — find the door",
  "cheat.teleportExit": "Teleported to the exit door",
  "cheat.on": "on",
  "cheat.off": "off",
  "cheat.label.god": "God",
  "cheat.label.noclip": "Noclip",
  "cheat.label.fullbright": "Fullbright",
  "cheat.label.freeze": "Frozen",
  "cheat.label.map": "Map",
};

export const translations: Record<Language, Record<Key, string>> = { si, en };

/** Substitutes {param} placeholders — the only templating this needs. */
export function t(lang: Language, key: Key, params?: Record<string, string | number>): string {
  let s = translations[lang][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
