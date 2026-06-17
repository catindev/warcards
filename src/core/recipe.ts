import type { CardDefinition, CardDefId, GameRecipe, ZoneDefinition, ZoneId } from "./types";

export function getCardDefinition(recipe: GameRecipe, defId: CardDefId): CardDefinition {
  const definition = recipe.cards.find((card) => card.id === defId);

  if (!definition) {
    throw new Error(`Unknown card definition: ${defId}`);
  }

  return definition;
}

export function getZoneDefinition(recipe: GameRecipe, zoneId: ZoneId): ZoneDefinition {
  const zone = recipe.zones.find((candidate) => candidate.id === zoneId);

  if (!zone) {
    throw new Error(`Unknown zone: ${zoneId}`);
  }

  return zone;
}

export function hasCardDefinition(recipe: GameRecipe, defId: CardDefId): boolean {
  return recipe.cards.some((card) => card.id === defId);
}

export function hasZoneDefinition(recipe: GameRecipe, zoneId: ZoneId): boolean {
  return recipe.zones.some((zone) => zone.id === zoneId);
}

export function validateRecipe(recipe: GameRecipe): void {
  const cardIds = new Set<CardDefId>();
  const zoneIds = new Set<ZoneId>();

  for (const card of recipe.cards) {
    if (cardIds.has(card.id)) {
      throw new Error(`Duplicate card definition: ${card.id}`);
    }

    cardIds.add(card.id);
  }

  for (const zone of recipe.zones) {
    if (zoneIds.has(zone.id)) {
      throw new Error(`Duplicate zone definition: ${zone.id}`);
    }

    zoneIds.add(zone.id);
  }

  for (const initialCard of recipe.initialState.cards) {
    if (!cardIds.has(initialCard.defId)) {
      throw new Error(`Initial card ${initialCard.id} references unknown definition ${initialCard.defId}`);
    }

    if (initialCard.location.kind === "zone" && !zoneIds.has(initialCard.location.zoneId)) {
      throw new Error(`Initial card ${initialCard.id} references unknown zone ${initialCard.location.zoneId}`);
    }
  }
}
