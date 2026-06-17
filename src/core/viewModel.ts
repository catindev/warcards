import type { CardId, CardInstance, CardStackViewModel, CardViewModel, GameRecipe, GameState, GameViewModel, ViewStyle } from "./types";
import { getCardDefinition } from "./recipe";

const DEFAULT_CARD_WIDTH = 120;
const DEFAULT_CARD_HEIGHT = 180;
const STACK_OFFSET_X = 15;
const STACK_OFFSET_Y = 20;
const DEFAULT_CARD_STYLE: ViewStyle = {
  background: "#fff7dd",
  border: "#4b3825",
  text: "#2b2118",
};

interface StackLayoutItem {
  rootId: CardId;
  memberIds: CardId[];
  index: number;
  x: number;
  y: number;
  z: number;
}

export function buildViewModel(state: GameState, recipe: GameRecipe): GameViewModel {
  const stackLayout = buildStackLayout(state);

  const cards = Object.values(state.cards)
    .map((card): CardViewModel => {
      const definition = getCardDefinition(recipe, card.defId);
      const position = stackLayout.get(card.id) ?? resolveLooseCardPosition(card);
      const stack = buildStackViewModel(card.id, position);

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
        ...(stack ? { stack } : {}),
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

function buildStackViewModel(cardId: CardId, layout: StackLayoutItem): CardStackViewModel | undefined {
  if (layout.memberIds.length <= 1) {
    return undefined;
  }

  return {
    rootId: layout.rootId,
    memberIds: layout.memberIds,
    size: layout.memberIds.length,
    index: layout.index,
    isRoot: cardId === layout.rootId,
    isTop: layout.index === layout.memberIds.length - 1,
  };
}

function buildStackLayout(state: GameState): Map<CardId, StackLayoutItem> {
  const groups = new Map<CardId, CardInstance[]>();

  for (const card of Object.values(state.cards)) {
    const rootId = findStackRootId(state, card.id);
    groups.set(rootId, [...(groups.get(rootId) ?? []), card]);
  }

  const layout = new Map<CardId, StackLayoutItem>();

  for (const [rootId, members] of groups.entries()) {
    const rootCard = state.cards[rootId];

    if (!rootCard) {
      continue;
    }

    const rootPosition = resolveLooseCardPosition(rootCard);
    const sortedMembers = [...members].sort((a, b) => {
      if (a.id === rootId) {
        return -1;
      }

      if (b.id === rootId) {
        return 1;
      }

      return a.location.z - b.location.z || a.id.localeCompare(b.id);
    });
    const memberIds = sortedMembers.map((member) => member.id);

    sortedMembers.forEach((member, index) => {
      layout.set(member.id, {
        rootId,
        memberIds,
        index,
        x: rootPosition.x + STACK_OFFSET_X * index,
        y: rootPosition.y + STACK_OFFSET_Y * index,
        z: rootPosition.z + index,
      });
    });
  }

  return layout;
}

function findStackRootId(state: GameState, cardId: CardId): CardId {
  let cursor = cardId;
  const visited = new Set<CardId>();

  while (!visited.has(cursor)) {
    visited.add(cursor);
    const card = state.cards[cursor];

    if (!card || card.location.kind !== "stack") {
      return cursor;
    }

    cursor = card.location.parentCardId;
  }

  return cardId;
}

function resolveLooseCardPosition(card: CardInstance): { x: number; y: number; z: number } {
  if (card.location.kind === "stack") {
    return { x: 0, y: 0, z: card.location.z };
  }

  return {
    x: card.location.x,
    y: card.location.y,
    z: card.location.z,
  };
}
