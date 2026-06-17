import {
  applyInputEvent,
  buildViewModel,
  createInitialState,
  createSaveSnapshot,
  restoreStateFromSnapshot,
  type GameInputEvent,
  type GameRecipe,
  type GameState,
  type GameViewModel,
  type SaveSnapshot,
  type SaveSlotId,
  type SaveStore,
} from "../core";

export interface TableRendererPort {
  mount(container: HTMLElement): Promise<void>;
  update(viewModel: GameViewModel): void;
  setInputHandler(handler: (event: GameInputEvent) => void): void;
  destroy(): void;
}

export interface TablePlayerOptions {
  recipe: GameRecipe;
  renderer: TableRendererPort;
  saveStore: SaveStore;
  slotId?: SaveSlotId;
  onStatus?: (message: string) => void;
}

export class TablePlayer {
  private state: GameState | null = null;
  private lastSnapshot: SaveSnapshot | undefined;
  private readonly slotId: SaveSlotId;

  constructor(private readonly options: TablePlayerOptions) {
    this.slotId = options.slotId ?? "autosave";
    this.options.renderer.setInputHandler((event) => {
      void this.handleInputEvent(event);
    });
  }

  async mount(container: HTMLElement): Promise<void> {
    await this.options.renderer.mount(container);
  }

  async newGame(): Promise<void> {
    this.state = createInitialState(this.options.recipe);
    await this.persist("New game started.");
    this.render();
  }

  async continueGame(): Promise<boolean> {
    const snapshot = await this.options.saveStore.load(this.slotId);

    if (!snapshot) {
      this.options.onStatus?.("No save found.");
      return false;
    }

    this.lastSnapshot = snapshot;
    this.state = restoreStateFromSnapshot(this.options.recipe, snapshot);
    this.options.onStatus?.(`Loaded save from ${new Date(snapshot.updatedAt).toLocaleString()}.`);
    this.render();
    return true;
  }

  async deleteSave(): Promise<void> {
    await this.options.saveStore.delete(this.slotId);
    this.lastSnapshot = undefined;
    this.options.onStatus?.("Save deleted.");
  }

  async hasSave(): Promise<boolean> {
    return (await this.options.saveStore.load(this.slotId)) !== null;
  }

  getState(): GameState | null {
    return this.state;
  }

  private async handleInputEvent(event: GameInputEvent): Promise<void> {
    if (!this.state) {
      return;
    }

    const previousState = this.state;
    this.state = applyInputEvent(this.state, this.options.recipe, event);

    if (this.state !== previousState) {
      await this.persist(`${event.type} saved.`);
      this.render();
    }
  }

  private render(): void {
    if (!this.state) {
      return;
    }

    this.options.renderer.update(buildViewModel(this.state, this.options.recipe));
  }

  private async persist(status: string): Promise<void> {
    if (!this.state) {
      return;
    }

    this.lastSnapshot = createSaveSnapshot(this.options.recipe, this.state, this.slotId, this.lastSnapshot);
    await this.options.saveStore.save(this.slotId, this.lastSnapshot);
    this.options.onStatus?.(status);
  }
}
