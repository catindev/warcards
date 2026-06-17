import type { SaveSlotId, SaveSlotInfo, SaveSnapshot, SaveStore } from "../core";

export class LocalStorageSaveStore implements SaveStore {
  constructor(private readonly namespace = "warcards") {}

  async list(): Promise<SaveSlotInfo[]> {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(this.keyPrefix()))
      .map((key) => this.safeRead(key))
      .filter((snapshot): snapshot is SaveSnapshot => snapshot !== null)
      .map((snapshot) => ({
        slotId: snapshot.slotId,
        recipeId: snapshot.recipeRef.recipeId,
        recipeVersion: snapshot.recipeRef.recipeVersion,
        updatedAt: snapshot.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(slotId: SaveSlotId): Promise<SaveSnapshot | null> {
    return this.safeRead(this.key(slotId));
  }

  async save(slotId: SaveSlotId, snapshot: SaveSnapshot): Promise<void> {
    localStorage.setItem(this.key(slotId), JSON.stringify(snapshot));
  }

  async delete(slotId: SaveSlotId): Promise<void> {
    localStorage.removeItem(this.key(slotId));
  }

  private safeRead(key: string): SaveSnapshot | null {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as SaveSnapshot;
    } catch {
      return null;
    }
  }

  private keyPrefix(): string {
    return `${this.namespace}:save:`;
  }

  private key(slotId: SaveSlotId): string {
    return `${this.keyPrefix()}${slotId}`;
  }
}
