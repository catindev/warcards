import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import type { CardId, CardViewModel, GameInputEvent, GameViewModel, ZoneViewModel } from "../core";
import type { TableRendererPort } from "../player/TablePlayer";

interface DraggedContainer {
  container: Container;
  startX: number;
  startY: number;
}

interface ActiveDrag {
  cardId: CardId;
  excludedCardIds: Set<CardId>;
  pointerStartX: number;
  pointerStartY: number;
  containers: DraggedContainer[];
  fromModal: boolean;
}

interface ParsedColor {
  color: number;
  alpha: number;
}

interface CardRenderOptions {
  x?: number;
  y?: number;
  z?: number;
  modal?: boolean;
  register?: boolean;
}

interface ModalStackCard {
  card: CardViewModel;
  container: Container;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  targetRotation: number;
  targetScale: number;
}

interface ModalStackState {
  rootId: CardId;
  cards: ModalStackCard[];
  progress: number;
  phase: "opening" | "open" | "closing";
}

export class PixiTableRenderer implements TableRendererPort {
  private app: Application | null = null;
  private inputHandler: (event: GameInputEvent) => void = () => undefined;
  private currentViewModel: GameViewModel | null = null;
  private activeDrag: ActiveDrag | null = null;
  private modalStack: ModalStackState | null = null;
  private modalAnimationFrameId: number | null = null;

  private readonly worldLayer = new Container();
  private readonly tableLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly cardLayer = new Container();
  private readonly dragLayer = new Container();
  private readonly revealHandleLayer = new Container();
  private readonly modalScrimLayer = new Container();
  private readonly modalLayer = new Container();
  private readonly cardContainers = new Map<CardId, Container>();

  async mount(container: HTMLElement): Promise<void> {
    this.destroy();

    const app = new Application();
    await app.init({
      width: 1600,
      height: 1000,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app = app;
    container.innerHTML = "";
    container.appendChild(app.canvas);

    app.stage.sortableChildren = true;
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, app.screen.width, app.screen.height);
    app.stage.on("pointermove", this.handlePointerMove);
    app.stage.on("pointerup", this.handlePointerUp);
    app.stage.on("pointerupoutside", this.handlePointerUp);

    this.worldLayer.zIndex = 0;
    this.dragLayer.zIndex = 30;
    this.revealHandleLayer.zIndex = 35;
    this.modalScrimLayer.zIndex = 40;
    this.modalLayer.zIndex = 50;

    this.tableLayer.zIndex = 0;
    this.zoneLayer.zIndex = 10;
    this.cardLayer.zIndex = 20;

    this.worldLayer.sortableChildren = true;
    this.cardLayer.sortableChildren = true;
    this.dragLayer.sortableChildren = true;
    this.revealHandleLayer.sortableChildren = true;
    this.modalLayer.sortableChildren = true;

    this.worldLayer.addChild(this.tableLayer, this.zoneLayer, this.cardLayer);
    app.stage.addChild(this.worldLayer, this.dragLayer, this.revealHandleLayer, this.modalScrimLayer, this.modalLayer);

    if (this.currentViewModel) {
      this.update(this.currentViewModel);
    }
  }

  update(viewModel: GameViewModel): void {
    this.currentViewModel = viewModel;

    if (!this.app) {
      return;
    }

    this.app.renderer.resize(viewModel.table.width, viewModel.table.height);
    this.app.stage.hitArea = new Rectangle(0, 0, viewModel.table.width, viewModel.table.height);

    if (this.modalStack && this.getStackMembers(viewModel, this.modalStack.rootId).length <= 1) {
      this.clearModalStack();
    }

    this.cardContainers.clear();
    this.tableLayer.removeChildren();
    this.zoneLayer.removeChildren();
    this.cardLayer.removeChildren();
    this.dragLayer.removeChildren();
    this.revealHandleLayer.removeChildren();
    this.modalScrimLayer.removeChildren();
    this.modalLayer.removeChildren();

    this.drawTable(viewModel);
    this.drawZones(viewModel.zones);
    this.drawCards(viewModel.cards);
    this.drawStackRevealHandles(viewModel.cards);

    if (this.modalStack) {
      this.setWorldBlocked(true);
      this.drawModalStack();
    } else {
      this.setWorldBlocked(false);
    }
  }

  setInputHandler(handler: (event: GameInputEvent) => void): void {
    this.inputHandler = handler;
  }

  destroy(): void {
    if (this.modalAnimationFrameId !== null) {
      cancelAnimationFrame(this.modalAnimationFrameId);
      this.modalAnimationFrameId = null;
    }

    if (!this.app) {
      return;
    }

    this.app.destroy(true, { children: true });
    this.app = null;
    this.cardContainers.clear();
    this.activeDrag = null;
    this.modalStack = null;
  }

  screenToTable(clientX: number, clientY: number): { x: number; y: number } {
    const app = this.requireApp();
    const viewModel = this.requireViewModel();
    const rect = app.canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((clientX - rect.left) * viewModel.table.width) / rect.width,
      y: ((clientY - rect.top) * viewModel.table.height) / rect.height,
    };
  }

  private drawTable(viewModel: GameViewModel): void {
    const background = parseColor(viewModel.table.background);
    const graphics = new Graphics();
    graphics.rect(0, 0, viewModel.table.width, viewModel.table.height).fill(background);
    this.tableLayer.addChild(graphics);
  }

  private drawZones(zones: ZoneViewModel[]): void {
    for (const zone of zones) {
      const background = parseColor(zone.style.background);
      const border = parseColor(zone.style.border);
      const zoneContainer = new Container();
      zoneContainer.position.set(zone.x, zone.y);
      zoneContainer.zIndex = 1;

      const graphics = new Graphics();
      graphics.roundRect(0, 0, zone.width, zone.height, 18).fill(background).stroke({
        color: border.color,
        alpha: border.alpha,
        width: 3,
      });

      const label = new Text({
        text: zone.label,
        style: {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 22,
          fontWeight: "700",
          fill: parseColor(zone.style.text).color,
        },
      });
      label.position.set(20, 20);

      zoneContainer.addChild(graphics, label);
      this.zoneLayer.addChild(zoneContainer);
    }
  }

  private drawCards(cards: CardViewModel[]): void {
    for (const card of cards) {
      const cardContainer = this.createCardContainer(card, { register: true });
      this.cardLayer.addChild(cardContainer);
    }
  }

  private createCardContainer(card: CardViewModel, options: CardRenderOptions = {}): Container {
    const background = parseColor(card.style.background);
    const border = parseColor(card.style.border);
    const textColor = parseColor(card.style.text);
    const container = new Container();
    container.position.set(options.x ?? card.x, options.y ?? card.y);
    container.zIndex = options.z ?? card.z;
    container.eventMode = card.draggable ? "static" : "none";
    container.cursor = card.draggable ? "grab" : "default";
    container.hitArea = new Rectangle(0, 0, card.width, card.height);

    const shadow = new Graphics();
    shadow.roundRect(5, 7, card.width, card.height, 14).fill({ color: 0x000000, alpha: options.modal ? 0.25 : 0.16 });

    const graphics = new Graphics();
    graphics.roundRect(0, 0, card.width, card.height, 14).fill(background).stroke({
      color: border.color,
      alpha: border.alpha,
      width: options.modal ? 2 : 3,
    });

    const icon = new Text({
      text: card.icon,
      style: {
        fontFamily: "Georgia, serif",
        fontSize: 42,
        fill: textColor.color,
      },
    });
    icon.anchor.set(0.5, 0.5);
    icon.position.set(card.width / 2, 50);

    const title = new Text({
      text: card.title,
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 13,
        fontWeight: "800",
        fill: textColor.color,
        align: "center",
        wordWrap: true,
        wordWrapWidth: card.width - 16,
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(card.width / 2, 96);

    container.addChild(shadow, graphics, icon, title);

    if (card.stack && card.stack.size > 1 && !options.modal) {
      this.drawStackCount(container, card);
    }

    container.on("pointerdown", (event) => this.handleCardPointerDown(event, card, container, Boolean(options.modal)));

    if (options.register ?? false) {
      this.cardContainers.set(card.id, container);
    }

    return container;
  }

  private drawStackCount(container: Container, card: CardViewModel): void {
    if (!card.stack) {
      return;
    }

    const badge = new Container();
    badge.position.set(8, 8);

    const badgeBackground = new Graphics();
    badgeBackground.roundRect(0, 0, 34, 22, 10).fill({ color: 0x2b2118, alpha: 0.84 });

    const count = new Text({
      text: `×${card.stack.size}`,
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        fill: 0xfff7dd,
      },
    });
    count.anchor.set(0.5, 0.5);
    count.position.set(17, 11);

    badge.addChild(badgeBackground, count);
    container.addChild(badge);
  }

  private drawStackRevealHandles(cards: CardViewModel[]): void {
    if (this.modalStack) {
      return;
    }

    const topStackCards = cards.filter((card) => card.stack?.isTop);

    for (const card of topStackCards) {
      const button = new Container();
      button.position.set(card.x + card.width + 10, card.y + 8);
      button.zIndex = 200_000;
      button.eventMode = "static";
      button.cursor = "pointer";
      button.hitArea = new Rectangle(0, 0, 34, 34);

      const background = new Graphics();
      background.circle(17, 17, 17).fill({ color: 0xfff7dd, alpha: 0.98 }).stroke({
        color: 0x4b3825,
        width: 2,
      });

      const icon = new Text({
        text: "☰",
        style: {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 15,
          fontWeight: "900",
          fill: 0x2b2118,
        },
      });
      icon.anchor.set(0.5, 0.5);
      icon.position.set(17, 17);

      button.addChild(background, icon);
      button.on("pointerdown", (event) => {
        stopEvent(event);
        this.openStackModal(card.stack?.rootId ?? card.id);
      });

      this.revealHandleLayer.addChild(button);
    }
  }

  private openStackModal(rootId: CardId): void {
    const viewModel = this.requireViewModel();
    const members = this.getStackMembers(viewModel, rootId);

    if (members.length <= 1) {
      return;
    }

    if (this.modalAnimationFrameId !== null) {
      cancelAnimationFrame(this.modalAnimationFrameId);
      this.modalAnimationFrameId = null;
    }

    const centerX = viewModel.table.width / 2;
    const centerY = viewModel.table.height / 2;
    const gap = Math.min(142, Math.max(92, 620 / Math.max(1, members.length - 1)));
    const startX = centerX - ((members.length - 1) * gap) / 2;

    this.revealHandleLayer.removeChildren();
    this.modalLayer.removeChildren();
    this.modalScrimLayer.removeChildren();

    this.modalStack = {
      rootId,
      progress: 0,
      phase: "opening",
      cards: members.map((card, index) => {
        const container = this.createCardContainer(card, {
          x: card.x,
          y: card.y,
          z: 1_000_000 + index,
          modal: true,
        });
        const normalized = members.length === 1 ? 0 : index / (members.length - 1) - 0.5;

        return {
          card,
          container,
          startX: card.x,
          startY: card.y,
          targetX: startX + index * gap,
          targetY: centerY - 72 - Math.abs(normalized) * 38,
          targetRotation: normalized * 0.24,
          targetScale: 1.16,
        };
      }),
    };

    this.setWorldBlocked(true);
    this.animateModalTo(1);
  }

  private closeStackModal(): void {
    if (!this.modalStack) {
      return;
    }

    this.modalStack.phase = "closing";
    this.animateModalTo(0, () => {
      this.clearModalStack();

      if (this.currentViewModel) {
        this.update(this.currentViewModel);
      }
    });
  }

  private clearModalStack(): void {
    if (this.modalAnimationFrameId !== null) {
      cancelAnimationFrame(this.modalAnimationFrameId);
      this.modalAnimationFrameId = null;
    }

    this.modalStack = null;
    this.modalLayer.removeChildren();
    this.modalScrimLayer.removeChildren();
    this.setWorldBlocked(false);
  }

  private setWorldBlocked(blocked: boolean): void {
    this.worldLayer.alpha = blocked ? 0.42 : 1;
  }

  private animateModalTo(target: 0 | 1, onDone?: () => void): void {
    if (!this.modalStack) {
      return;
    }

    if (this.modalAnimationFrameId !== null) {
      cancelAnimationFrame(this.modalAnimationFrameId);
      this.modalAnimationFrameId = null;
    }

    const startedAt = performance.now();
    const durationMs = 190;
    const initial = this.modalStack.progress;

    const tick = (timestamp: number): void => {
      if (!this.modalStack) {
        return;
      }

      const raw = Math.min(1, (timestamp - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - raw, 3);
      this.modalStack.progress = initial + (target - initial) * eased;
      this.drawModalStack();

      if (raw < 1) {
        this.modalAnimationFrameId = requestAnimationFrame(tick);
        return;
      }

      this.modalStack.progress = target;
      this.modalStack.phase = target === 1 ? "open" : "closing";
      this.modalAnimationFrameId = null;
      this.drawModalStack();
      onDone?.();
    };

    this.modalAnimationFrameId = requestAnimationFrame(tick);
  }

  private drawModalStack(): void {
    this.modalLayer.removeChildren();
    this.modalScrimLayer.removeChildren();

    if (!this.modalStack) {
      return;
    }

    const viewModel = this.requireViewModel();
    const scrim = new Graphics();
    scrim.rect(0, 0, viewModel.table.width, viewModel.table.height).fill({ color: 0xbababa, alpha: 0.34 });
    scrim.rect(0, 0, viewModel.table.width, viewModel.table.height).fill({ color: 0x000000, alpha: 0.30 });
    scrim.eventMode = "static";
    scrim.hitArea = new Rectangle(0, 0, viewModel.table.width, viewModel.table.height);
    scrim.on("pointerdown", (event) => {
      stopEvent(event);
      this.closeStackModal();
    });
    this.modalScrimLayer.addChild(scrim);

    const modal = this.modalStack;
    const progress = modal.progress;

    for (const item of modal.cards) {
      const x = lerp(item.startX, item.targetX, progress);
      const y = lerp(item.startY, item.targetY, progress);
      item.container.position.set(x, y);
      item.container.rotation = item.targetRotation * progress;
      item.container.scale.set(1 + (item.targetScale - 1) * progress);
      item.container.alpha = 0.88 + 0.12 * progress;
      item.container.zIndex = 1_000_000 + item.card.z;
      this.modalLayer.addChild(item.container);
    }

    this.drawModalCloseHandle(modal);
  }

  private drawModalCloseHandle(modal: ModalStackState): void {
    if (modal.cards.length === 0 || modal.progress < 0.72) {
      return;
    }

    const right = Math.max(...modal.cards.map((item) => item.container.x + item.card.width * item.container.scale.x));
    const top = Math.min(...modal.cards.map((item) => item.container.y));
    const button = new Container();
    button.position.set(right + 28, top - 6);
    button.zIndex = 1_100_000;
    button.eventMode = "static";
    button.cursor = "pointer";
    button.hitArea = new Rectangle(0, 0, 36, 36);

    const background = new Graphics();
    background.circle(18, 18, 18).fill({ color: 0xfff7dd, alpha: 0.98 }).stroke({
      color: 0x4b3825,
      width: 2,
    });

    const icon = new Text({
      text: "×",
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 22,
        fontWeight: "900",
        fill: 0x2b2118,
      },
    });
    icon.anchor.set(0.5, 0.5);
    icon.position.set(18, 17);

    button.addChild(background, icon);
    button.on("pointerdown", (event) => {
      stopEvent(event);
      this.closeStackModal();
    });

    this.modalLayer.addChild(button);
  }

  private handleCardPointerDown = (event: unknown, card: CardViewModel, container: Container, fromModal: boolean): void => {
    if (!this.currentViewModel) {
      return;
    }

    if (this.modalStack && !fromModal) {
      return;
    }

    stopEvent(event);

    const point = this.eventToTablePoint(event);
    const dragCardId = fromModal ? card.id : card.stack?.rootId ?? card.id;
    const stackMemberIds = !fromModal && card.stack ? card.stack.memberIds : [card.id];
    const draggedContainers = stackMemberIds
      .map((cardId) => this.cardContainers.get(cardId))
      .filter((candidate): candidate is Container => candidate !== undefined);

    const containers = fromModal || draggedContainers.length === 0 ? [container] : draggedContainers;

    this.activeDrag = {
      cardId: dragCardId,
      excludedCardIds: new Set(stackMemberIds),
      pointerStartX: point.x,
      pointerStartY: point.y,
      fromModal,
      containers: containers.map((candidate, index) => {
        candidate.alpha = 0.94;
        candidate.cursor = "grabbing";
        candidate.zIndex = 1_200_000 + index;
        this.dragLayer.addChild(candidate);

        return {
          container: candidate,
          startX: candidate.x,
          startY: candidate.y,
        };
      }),
    };

    this.inputHandler({
      type: "card.drag_started",
      cardId: dragCardId,
      x: point.x,
      y: point.y,
    });
  };

  private handlePointerMove = (event: unknown): void => {
    if (!this.activeDrag) {
      return;
    }

    const point = this.eventToTablePoint(event);
    const dx = point.x - this.activeDrag.pointerStartX;
    const dy = point.y - this.activeDrag.pointerStartY;

    for (const dragged of this.activeDrag.containers) {
      dragged.container.position.set(dragged.startX + dx, dragged.startY + dy);
    }
  };

  private handlePointerUp = (event: unknown): void => {
    if (!this.activeDrag || !this.currentViewModel) {
      return;
    }

    const activeDrag = this.activeDrag;
    const point = this.eventToTablePoint(event);
    const primary = activeDrag.containers[0]?.container;
    const dropX = primary?.x ?? point.x;
    const dropY = primary?.y ?? point.y;
    const targetCard = activeDrag.fromModal ? null : this.findTopCardAt(point.x, point.y, activeDrag.excludedCardIds);
    const targetZone = targetCard ? null : this.findZoneAt(point.x, point.y);

    this.activeDrag = null;

    if (activeDrag.fromModal) {
      this.clearModalStack();
    }

    if (targetCard) {
      this.inputHandler({
        type: "card.dropped_on_card",
        sourceCardId: activeDrag.cardId,
        targetCardId: targetCard.id,
        x: point.x,
        y: point.y,
      });
    } else if (targetZone) {
      this.inputHandler({
        type: "card.dropped_on_zone",
        cardId: activeDrag.cardId,
        zoneId: targetZone.id,
        x: dropX,
        y: dropY,
      });
    } else {
      this.inputHandler({
        type: "card.dropped_on_empty",
        cardId: activeDrag.cardId,
        x: dropX,
        y: dropY,
      });
    }
  };

  private findTopCardAt(x: number, y: number, excludedCardIds: Set<CardId>): CardViewModel | null {
    if (this.modalStack) {
      return null;
    }

    const viewModel = this.requireViewModel();

    return [...viewModel.cards]
      .filter((card) => !excludedCardIds.has(card.id))
      .sort((a, b) => b.z - a.z)
      .find((card) => x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height) ?? null;
  }

  private findZoneAt(x: number, y: number): ZoneViewModel | null {
    const viewModel = this.requireViewModel();

    return viewModel.zones.find((zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) ?? null;
  }

  private getStackMembers(viewModel: GameViewModel, rootId: CardId): CardViewModel[] {
    return viewModel.cards
      .filter((card) => card.stack?.rootId === rootId)
      .sort((a, b) => (a.stack?.index ?? 0) - (b.stack?.index ?? 0));
  }

  private eventToTablePoint(event: unknown): { x: number; y: number } {
    const native = (event as { nativeEvent?: PointerEvent }).nativeEvent;

    if (native) {
      return this.screenToTable(native.clientX, native.clientY);
    }

    const fallback = event as { clientX?: number; clientY?: number; global?: { x: number; y: number } };

    if (typeof fallback.clientX === "number" && typeof fallback.clientY === "number") {
      return this.screenToTable(fallback.clientX, fallback.clientY);
    }

    if (fallback.global) {
      return fallback.global;
    }

    return { x: 0, y: 0 };
  }

  private requireApp(): Application {
    if (!this.app) {
      throw new Error("Renderer is not mounted.");
    }

    return this.app;
  }

  private requireViewModel(): GameViewModel {
    if (!this.currentViewModel) {
      throw new Error("Renderer has no view model.");
    }

    return this.currentViewModel;
  }
}

function parseColor(value: string): ParsedColor {
  const fallback: ParsedColor = { color: 0xffffff, alpha: 1 };

  if (!value.startsWith("#")) {
    return fallback;
  }

  const hex = value.slice(1);

  if (hex.length === 6) {
    return { color: Number.parseInt(hex, 16), alpha: 1 };
  }

  if (hex.length === 8) {
    return {
      color: Number.parseInt(hex.slice(0, 6), 16),
      alpha: Number.parseInt(hex.slice(6, 8), 16) / 255,
    };
  }

  return fallback;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function stopEvent(event: unknown): void {
  const maybeEvent = event as { stopPropagation?: () => void };
  maybeEvent.stopPropagation?.();
}
