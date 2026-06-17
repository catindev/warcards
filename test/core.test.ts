import { describe, expect, it } from "vitest";
import {
  applyInputEvent,
  buildViewModel,
  createInitialState,
  createSaveSnapshot,
  restoreStateFromSnapshot,
} from "../src/core";
import { warcardsV0Recipe } from "../src/recipes/warcardsV0";

describe("table runtime v0", () => {
  it("creates initial state from recipe", () => {
    const state = createInitialState(warcardsV0Recipe, {
      sessionId: "test_session",
      now: "2026-01-01T00:00:00.000Z",
    });

    expect(state.session.id).toBe("test_session");
    expect(state.table.id).toBe(warcardsV0Recipe.table.id);
    expect(Object.keys(state.cards)).toContain("king_1");
  });

  it("moves a card on empty table drop", () => {
    const state = createInitialState(warcardsV0Recipe);
    const next = applyInputEvent(state, warcardsV0Recipe, {
      type: "card.dropped_on_empty",
      cardId: "king_1",
      x: 123,
      y: 456,
    });

    expect(next.cards.king_1.location).toMatchObject({ kind: "table", x: 123, y: 456 });
    expect(next).not.toBe(state);
  });

  it("stacks a card when dropped on another card", () => {
    const state = createInitialState(warcardsV0Recipe);
    const next = applyInputEvent(state, warcardsV0Recipe, {
      type: "card.dropped_on_card",
      sourceCardId: "peasant_1",
      targetCardId: "king_1",
      x: 760,
      y: 470,
    });

    expect(next.cards.peasant_1.location).toMatchObject({
      kind: "stack",
      parentCardId: "king_1",
    });
  });

  it("stacks new cards on the existing stack root", () => {
    const state = createInitialState(warcardsV0Recipe);
    const withPeasant = applyInputEvent(state, warcardsV0Recipe, {
      type: "card.dropped_on_card",
      sourceCardId: "peasant_1",
      targetCardId: "king_1",
      x: 760,
      y: 470,
    });
    const withTree = applyInputEvent(withPeasant, warcardsV0Recipe, {
      type: "card.dropped_on_card",
      sourceCardId: "tree_1",
      targetCardId: "peasant_1",
      x: 770,
      y: 480,
    });

    expect(withTree.cards.tree_1.location).toMatchObject({
      kind: "stack",
      parentCardId: "king_1",
    });
  });

  it("restores state from save snapshot", () => {
    const state = createInitialState(warcardsV0Recipe);
    const moved = applyInputEvent(state, warcardsV0Recipe, {
      type: "card.dropped_on_zone",
      cardId: "sheep_1",
      zoneId: "left_zone",
      x: 120,
      y: 150,
    });
    const snapshot = createSaveSnapshot(warcardsV0Recipe, moved, "autosave");
    const restored = restoreStateFromSnapshot(warcardsV0Recipe, snapshot);

    expect(restored.cards.sheep_1.location).toMatchObject({
      kind: "zone",
      zoneId: "left_zone",
      x: 120,
      y: 150,
    });
  });

  it("builds renderer view model without leaking recipe state into renderer", () => {
    const state = createInitialState(warcardsV0Recipe);
    const viewModel = buildViewModel(state, warcardsV0Recipe);

    expect(viewModel.table.width).toBe(1600);
    expect(viewModel.zones).toHaveLength(2);
    expect(viewModel.cards.find((card) => card.id === "king_1")?.title).toBe("Король");
  });

  it("adds stack metadata to stacked cards in view model", () => {
    const state = createInitialState(warcardsV0Recipe);
    const stacked = applyInputEvent(state, warcardsV0Recipe, {
      type: "card.dropped_on_card",
      sourceCardId: "peasant_1",
      targetCardId: "king_1",
      x: 760,
      y: 470,
    });
    const viewModel = buildViewModel(stacked, warcardsV0Recipe);
    const king = viewModel.cards.find((card) => card.id === "king_1");
    const peasant = viewModel.cards.find((card) => card.id === "peasant_1");

    expect(king?.stack).toMatchObject({ rootId: "king_1", size: 2, index: 0, isRoot: true, isTop: false });
    expect(peasant?.stack).toMatchObject({ rootId: "king_1", size: 2, index: 1, isRoot: false, isTop: true });
  });
});
