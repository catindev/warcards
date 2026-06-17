import type { CardId, CardInstance, CardLocation, GameInputEvent, GameRecipe, GameState, StackLocation } from "./types";
import { hasCardDefinition, hasZoneDefinition, validateRecipe } from "./recipe";

const AUTO_STACK_RADIUS = 95;

export interface CreateInitialStateOptions {
  sessionId?: string;
  now?: string;
}

export function createInitialState(recipe: GameRecipe, options: CreateInitialStateOptions = {}): GameState {
  validateRecipe(recipe);

  const now = options.now ?? new Date().toISOString();
  const cards: Record<CardId, CardInstance> = {};

  for (const card of recipe.initialState.cards) {
    cards[card.id] = {
      id: card.id,
      defId: card.defId,
      location: cloneLocation(card.location),
    };
  }

  return {
    session: {
      id: options.sessionId ?? createId("session"),
      status: "running",
      tick: 0,
      createdAt: now,
      updatedAt: now,
    },
    table: {
      id: recipe.table.id,
    },
    cards,
  };
}

export function applyInputEvent(state: GameState, recipe: GameRecipe, event: GameInputEvent, now = new Date().toISOString()): GameState {
  switch (event.type) {
    case "card.clicked":
    case "card.drag_started":
      return state;

    case "card.dropped_on_empty": {
      const moved = moveCard(state, event.cardId, {
        kind: "table",
        x: event.x,
        y: event.y,
        z: nextTopZ(state),
      }, now);

      return autoStackNearbyIdentical(moved, event.cardId, now);
    }

    case "card.dropped_on_zone": {
      if (!hasZoneDefinition(recipe, event.zoneId)) {
        return state;
      }

      const moved = moveCard(state, event.cardId, {
        kind: "zone",
        zoneId: event.zoneId,
        x: event.x,
        y: event.y,
        z: nextTopZ(state),
      }, now);

      return autoStackNearbyIdentical(moved, event.cardId, now);
    }

    case "card.dropped_on_card": {
      if (event.sourceCardId === event.targetCardId) {
        return state;
      }

      const source = state.cards[event.sourceCardId];
      const target = state.cards[event.targetCardId];

      if (!source || !target) {
        return state;
      }

      const targetRootId = getStackRootId(state.cards, event.targetCardId);

      if (targetRootId === event.sourceCardId || wouldCreateStackCycle(state, event.sourceCardId, targetRootId)) {
        return state;
      }

      const location: StackLocation = {
        kind: "stack",
        parentCardId: targetRootId,
        offsetX: 18,
        offsetY: 22,
        z: nextTopZ(state),
      };

      return moveCard(state, event.sourceCardId, location, now);
    }
  }
}

export function restoreState(recipe: GameRecipe, state: GameState): GameState {
  const repairedCards: Record<CardId, CardInstance> = {};

  for (const card of Object.values(state.cards)) {
    if (!hasCardDefinition(recipe, card.defId)) {
      continue;
    }

    repairedCards[card.id] = {
      ...card,
      location: cloneLocation(card.location),
    };
  }

  for (const card of Object.values(repairedCards)) {
    card.location = repairLocation(recipe, repairedCards, card.location);
  }

  return {
    ...state,
    table: { id: recipe.table.id },
    cards: repairedCards,
  };
}

function moveCard(state: GameState, cardId: CardId, location: CardLocation, now: string): GameState {
  const card = state.cards[cardId];

  if (!card) {
    return state;
  }

  return {
    ...state,
    session: {
      ...state.session,
      updatedAt: now,
    },
    cards: {
      ...state.cards,
      [cardId]: {
        ...card,
        location,
      },
    },
  };
}

function autoStackNearbyIdentical(state: GameState, cardId: CardId, now: string): GameState {
  const card = state.cards[cardId];

  if (!card || card.location.kind === "stack") {
    return state;
  }

  const cardPosition = locationPoint(card.location);
  const candidate = Object.values(state.cards)
    .filter((other) => other.id !== card.id)
    .filter((other) => other.defId === card.defId)
    .filter((other) => other.location.kind !== "stack")
    .filter((other) => isSameLooseLocation(card.location, other.location))
    .map((other) => ({ other, distance: distance(cardPosition, locationPoint(other.location)) }))
    .filter(({ distance }) => distance <= AUTO_STACK_RADIUS)
    .sort((a, b) => a.distance - b.distance || a.other.id.localeCompare(b.other.id))[0]?.other;

  if (!candidate) {
    return state;
  }

  return moveCard(state, cardId, {
    kind: "stack",
    parentCardId: candidate.id,
    offsetX: 18,
    offsetY: 22,
    z: nextTopZ(state),
  }, now);
}

function repairLocation(recipe: GameRecipe, cards: Record<CardId, CardInstance>, location: CardLocation): CardLocation {
  if (location.kind === "zone" && !hasZoneDefinition(recipe, location.zoneId)) {
    return { kind: "table", x: location.x, y: location.y, z: location.z };
  }

  if (location.kind === "stack" && !cards[location.parentCardId]) {
    return { kind: "table", x: 80, y: 80, z: location.z };
  }

  return cloneLocation(location);
}

function getStackRootId(cards: Record<CardId, CardInstance>, cardId: CardId): CardId {
  let cursor = cardId;
  const visited = new Set<CardId>();

  while (!visited.has(cursor)) {
    visited.add(cursor);
    const card = cards[cursor];

    if (!card || card.location.kind !== "stack") {
      return cursor;
    }

    cursor = card.location.parentCardId;
  }

  return cardId;
}

function wouldCreateStackCycle(state: GameState, sourceId: CardId, targetId: CardId): boolean {
  let cursor: CardId | undefined = targetId;
  const visited = new Set<CardId>();

  while (cursor) {
    if (cursor === sourceId) {
      return true;
    }

    if (visited.has(cursor)) {
      return true;
    }

    visited.add(cursor);

    const card = state.cards[cursor];
    cursor = card?.location.kind === "stack" ? card.location.parentCardId : undefined;
  }

  return false;
}

function nextTopZ(state: GameState): number {
  return Math.max(0, ...Object.values(state.cards).map((card) => card.location.z)) + 1;
}

function cloneLocation(location: CardLocation): CardLocation {
  return { ...location };
}

function locationPoint(location: CardLocation): { x: number; y: number } {
  if (location.kind === "stack") {
    return { x: 0, y: 0 };
  }

  return { x: location.x, y: location.y };
}

function isSameLooseLocation(a: CardLocation, b: CardLocation): boolean {
  if (a.kind === "table" && b.kind === "table") {
    return true;
  }

  if (a.kind === "zone" && b.kind === "zone") {
    return a.zoneId === b.zoneId;
  }

  return false;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
