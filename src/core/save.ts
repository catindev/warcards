import type { GameRecipe, GameState, SaveSnapshot, SaveSlotId } from "./types";
import { restoreState } from "./state";

export function createSaveSnapshot(recipe: GameRecipe, state: GameState, slotId: SaveSlotId, previous?: SaveSnapshot): SaveSnapshot {
  const now = new Date().toISOString();

  return {
    schemaVersion: "0.1.0",
    saveId: previous?.saveId ?? createId("save"),
    slotId,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    recipeRef: {
      recipeId: recipe.id,
      recipeVersion: recipe.version,
    },
    state,
  };
}

export function restoreStateFromSnapshot(recipe: GameRecipe, snapshot: SaveSnapshot): GameState {
  if (snapshot.schemaVersion !== "0.1.0") {
    throw new Error(`Unsupported save schema version: ${snapshot.schemaVersion}`);
  }

  if (snapshot.recipeRef.recipeId !== recipe.id) {
    throw new Error(`Save recipe mismatch: expected ${recipe.id}, got ${snapshot.recipeRef.recipeId}`);
  }

  return restoreState(recipe, snapshot.state);
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
