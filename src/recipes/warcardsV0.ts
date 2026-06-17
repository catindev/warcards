import type { GameRecipe } from "../core";

export const warcardsV0Recipe: GameRecipe = {
  schemaVersion: "0.1.0",
  id: "warcards.table-runtime-v0",
  version: "0.1.0",
  title: "Warcards Table Runtime v0",
  table: {
    id: "main_table",
    width: 1600,
    height: 1000,
    background: "#d7b675",
  },
  zones: [
    {
      id: "left_zone",
      label: "Зона стола",
      rect: { x: 52, y: 70, width: 270, height: 860 },
      presentation: {
        background: "#f2dca088",
        border: "#795637",
        text: "#3d2a1a",
      },
    },
    {
      id: "right_zone",
      label: "Будущая зона действий",
      rect: { x: 1278, y: 70, width: 270, height: 860 },
      presentation: {
        background: "#f2dca055",
        border: "#795637",
        text: "#3d2a1a",
      },
    },
  ],
  cards: [
    {
      id: "king",
      title: "Король",
      tags: ["character", "king"],
      presentation: {
        icon: "♛",
        background: "#fff4c2",
        border: "#5b2e15",
        text: "#24160f",
      },
    },
    {
      id: "peasant",
      title: "Крестьянин",
      tags: ["character", "worker"],
      presentation: {
        icon: "☻",
        background: "#fff7dd",
        border: "#4b3825",
        text: "#24160f",
      },
    },
    {
      id: "tree",
      title: "Дерево",
      tags: ["source", "wood"],
      presentation: {
        icon: "♣",
        background: "#dff0c2",
        border: "#375421",
        text: "#1c2d12",
      },
    },
    {
      id: "mine",
      title: "Шахта",
      tags: ["source", "gold"],
      presentation: {
        icon: "◆",
        background: "#e2ded4",
        border: "#4c4941",
        text: "#24231f",
      },
    },
    {
      id: "sheep",
      title: "Овечка",
      tags: ["animal"],
      presentation: {
        icon: "♧",
        background: "#f6f1df",
        border: "#746f62",
        text: "#2b2924",
      },
    },
  ],
  initialState: {
    cards: [
      {
        id: "king_1",
        defId: "king",
        location: { kind: "table", x: 730, y: 420, z: 10 },
      },
      {
        id: "peasant_1",
        defId: "peasant",
        location: { kind: "table", x: 590, y: 445, z: 11 },
      },
      {
        id: "tree_1",
        defId: "tree",
        location: { kind: "table", x: 430, y: 245, z: 1 },
      },
      {
        id: "mine_1",
        defId: "mine",
        location: { kind: "table", x: 430, y: 620, z: 1 },
      },
      {
        id: "sheep_1",
        defId: "sheep",
        location: { kind: "table", x: 1020, y: 445, z: 1 },
      },
    ],
  },
};
