import "./styles.css";
import { LocalStorageSaveStore } from "./platform/LocalStorageSaveStore";
import { TablePlayer } from "./player/TablePlayer";
import { warcardsV0Recipe } from "./recipes/warcardsV0";
import { PixiTableRenderer } from "./renderer/PixiTableRenderer";

const PROTOTYPE_BUILD = "card-feel-image-animations-v3";

const gameRoot = getElement("game-root");
const newGameButton = getButton("new-game");
const continueButton = getButton("continue-game");
const deleteSaveButton = getButton("delete-save");
const status = getElement("status");

const saveStore = new LocalStorageSaveStore();
const renderer = new PixiTableRenderer();
const player = new TablePlayer({
  recipe: warcardsV0Recipe,
  renderer,
  saveStore,
  slotId: "autosave",
  onStatus: setStatus,
});

await player.mount(gameRoot);
setStatus("Ready.");
await refreshContinueButton();

newGameButton.addEventListener("click", async () => {
  await player.newGame();
  await refreshContinueButton();
});

continueButton.addEventListener("click", async () => {
  await player.continueGame();
  await refreshContinueButton();
});

deleteSaveButton.addEventListener("click", async () => {
  await player.deleteSave();
  await refreshContinueButton();
});

async function refreshContinueButton(): Promise<void> {
  const hasSave = await player.hasSave();
  continueButton.disabled = !hasSave;
  deleteSaveButton.disabled = !hasSave;
}

function setStatus(message: string): void {
  const state = player.getState();
  const suffix = state ? `\nCards: ${Object.keys(state.cards).length}. Updated: ${new Date(state.session.updatedAt).toLocaleTimeString()}.` : "";
  status.textContent = `${message}\nBuild: ${PROTOTYPE_BUILD}${suffix}`;
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element;
}

function getButton(id: string): HTMLButtonElement {
  const element = getElement(id);

  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`#${id} is not a button`);
  }

  return element;
}
