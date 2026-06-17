export type CardId = string;
export type CardDefId = string;
export type ZoneId = string;
export type RecipeId = string;
export type SaveSlotId = string;

export type SessionStatus = "running" | "paused" | "lost" | "won";

export interface GameRecipe {
  schemaVersion: "0.1.0";
  id: RecipeId;
  version: string;
  title: string;
  table: TableDefinition;
  zones: ZoneDefinition[];
  cards: CardDefinition[];
  initialState: InitialStateDefinition;
}

export interface TableDefinition {
  id: string;
  width: number;
  height: number;
  background: string;
}

export interface ZoneDefinition {
  id: ZoneId;
  label: string;
  rect: Rect;
  accepts?: CardMatcher;
  presentation?: ZonePresentation;
}

export interface CardDefinition {
  id: CardDefId;
  title: string;
  tags: string[];
  presentation: CardPresentation;
}

export interface InitialStateDefinition {
  cards: InitialCardInstance[];
}

export interface InitialCardInstance {
  id: CardId;
  defId: CardDefId;
  location: CardLocation;
}

export interface CardMatcher {
  defIds?: CardDefId[];
  tags?: string[];
}

export interface CardPresentation {
  icon: string;
  background?: string;
  border?: string;
  text?: string;
}

export interface ZonePresentation {
  background?: string;
  border?: string;
  text?: string;
}

export interface GameState {
  session: SessionState;
  table: TableState;
  cards: Record<CardId, CardInstance>;
}

export interface SessionState {
  id: string;
  status: SessionStatus;
  tick: number;
  createdAt: string;
  updatedAt: string;
}

export interface TableState {
  id: string;
}

export interface CardInstance {
  id: CardId;
  defId: CardDefId;
  location: CardLocation;
}

export type CardLocation = TableLocation | ZoneLocation | StackLocation;

export interface TableLocation {
  kind: "table";
  x: number;
  y: number;
  z: number;
}

export interface ZoneLocation {
  kind: "zone";
  zoneId: ZoneId;
  x: number;
  y: number;
  z: number;
}

export interface StackLocation {
  kind: "stack";
  parentCardId: CardId;
  offsetX: number;
  offsetY: number;
  z: number;
}

export interface SaveSnapshot {
  schemaVersion: "0.1.0";
  saveId: string;
  slotId: SaveSlotId;
  createdAt: string;
  updatedAt: string;
  recipeRef: RecipeRef;
  state: GameState;
}

export interface RecipeRef {
  recipeId: RecipeId;
  recipeVersion: string;
  recipeHash?: string;
}

export interface SaveSlotInfo {
  slotId: SaveSlotId;
  recipeId: RecipeId;
  recipeVersion: string;
  updatedAt: string;
}

export interface SaveStore {
  list(): Promise<SaveSlotInfo[]>;
  load(slotId: SaveSlotId): Promise<SaveSnapshot | null>;
  save(slotId: SaveSlotId, snapshot: SaveSnapshot): Promise<void>;
  delete(slotId: SaveSlotId): Promise<void>;
}

export type GameInputEvent =
  | CardClickedEvent
  | CardDragStartedEvent
  | CardDroppedOnEmptyEvent
  | CardDroppedOnCardEvent
  | CardDroppedOnZoneEvent;

export interface CardClickedEvent {
  type: "card.clicked";
  cardId: CardId;
  x: number;
  y: number;
}

export interface CardDragStartedEvent {
  type: "card.drag_started";
  cardId: CardId;
  x: number;
  y: number;
}

export interface CardDroppedOnEmptyEvent {
  type: "card.dropped_on_empty";
  cardId: CardId;
  x: number;
  y: number;
}

export interface CardDroppedOnCardEvent {
  type: "card.dropped_on_card";
  sourceCardId: CardId;
  targetCardId: CardId;
  x: number;
  y: number;
}

export interface CardDroppedOnZoneEvent {
  type: "card.dropped_on_zone";
  cardId: CardId;
  zoneId: ZoneId;
  x: number;
  y: number;
}

export interface GameViewModel {
  table: TableViewModel;
  zones: ZoneViewModel[];
  cards: CardViewModel[];
}

export interface TableViewModel {
  id: string;
  width: number;
  height: number;
  background: string;
}

export interface ZoneViewModel {
  id: ZoneId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: ViewStyle;
}

export interface CardViewModel {
  id: CardId;
  defId: CardDefId;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  title: string;
  icon: string;
  draggable: boolean;
  droppable: boolean;
  style: ViewStyle;
}

export interface ViewStyle {
  background: string;
  border: string;
  text: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
