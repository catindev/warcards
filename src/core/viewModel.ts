import type { CardId, CardViewModel, GameRecipe, GameState, GameViewModel, ViewStyle } from "./types";
import { getCardDefinition } from "./recipe";

const DEFAULT_CARD_WIDTH = 112;
const DEFAULT_CARD_HEIGHT = 154;
const DEFAULT_CARD_STYLE: ViewStyle = {
  background: "#fff7dd",
  border: "#4b3825",
  text: "#2b2118",
};

export function buildViewModel(state: GameState, recipe: GameRecipe): GameViewModel {
  const cards = Object.values(state.cards)
    .map((card): CardViewModel => {
      const definition = getCardDefinition(recipe, card.defId);
      const position = resolveCardPosition(state, card.id);

      return {
        id: card.id,
        defId: card.defId,
        x: position.x,
        y: position.y,
        z: position.z,
        width: DEFAULT_CARD_WIDTH,
        height: DEFAULT_CARD_HEIGHT,
        title: definition.title,
        icon: definition.presentation.icon,
        draggable: true,
        droppable: true,
        style: {
          background: definition.presentation.background ?? DEFAULT_CARD_STYLE.background,
          border: definition.presentation.border ?? DEFAULT_CARD_STYLE.border,
          text: definition.presentation.text ?? DEFAULT_CARD_STYLE.text,
        },
      };
    })
    .sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));

  return {
    table: {
      id: recipe.table.id,
      width: recipe.table.width,
      height: recipe.table.height,
      background: recipe.table.background,
    },
    zones: recipe.zones.map((zone) => ({
      id: zone.id,
      label: zone.label,
      x: zone.rect.x,
      y: zone.rect.y,
      width: zone.rect.width,
      height: zone.rect.height,
      style: {
        background: zone.presentation?.background ?? "#ead39f66",
        border: zone.presentation?.border ?? "#6d4c2f",
        text: zone.presentation?.text ?? "#2b2118",
      },
    })),
    cards,
  };
}

function resolveCardPosition(state: GameState, cardId: CardId, visited = new Set<CardId>()): { x: number; y: number; z: number } {
  const card = state.cards[cardId];

  if (!card || visited.has(cardId)) {
    return { x: 0, y: 0, z: 0 };
  }

  visited.add(cardId);

  if (card.location.kind === "stack") {
    const parent = resolveCardPosition(state, card.location.parentCardId, visited);

    return {
      x: parent.x + card.location.offsetX,
      y: parent.y + card.location.offsetY,
      z: Math.max(parent.z + 1, card.location.z),
    };
  }

  return {
    x: card.location.x,
    y: card.location.y,
    z: card.location.z,
  };
}
