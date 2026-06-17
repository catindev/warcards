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
}

interface ParsedColor {
  color: number;
  alpha: number;
}

interface CardRenderOptions {
  x?: number;
  y?: number;
  z?: number;
  overlay?: boolean;
  register?: boolean;
}

export class PixiTableRenderer implements TableRendererPort {
  private app: Application | null = null;
  private inputHandler: (event: GameInputEvent) => void = () => undefined;
  private currentViewModel: GameViewModel | null = null;
  private activeDrag: ActiveDrag | null = null;
  private expandedStackRootId: CardId | null = null;

  private readonly tableLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly cardLayer = new Container();
  private readonly dragLayer = new Container();
  private readonly overlayLayer = new Container();
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

    this.tableLayer.zIndex = 0;
    this.zoneLayer.zIndex = 10;
    this.cardLayer.zIndex = 20;
    this.dragLayer.zIndex = 30;
    this.overlayLayer.zIndex = 40;
    this.cardLayer.sortableChildren = true;
    this.dragLayer.sortableChildren = true;
    this.overlayLayer.sortableChildren = true;

    app.stage.addChild(this.tableLayer, this.zoneLayer, this.cardLayer, this.dragLayer, this.overlayLayer);

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

    if (this.expandedStackRootId && this.getStackMembers(viewModel, this.expandedStackRootId).length <= 1) {
      this.expandedStackRootId = null;
    }

    this.cardContainers.clear();
    this.tableLayer.removeChildren();
    this.zoneLayer.removeChildren();
    this.cardLayer.removeChildren();
    this.dragLayer.removeChildren();
    this.overlayLayer.removeChildren();

    this.drawTable(viewModel);
    this.drawZones(viewModel.zones);
    this.drawCards(viewModel.cards);
    this.drawExpandedStack(viewModel);
  }

  setInputHandler(handler: (event: GameInputEvent) => void): void {
    this.inputHandler = handler;
  }

  destroy(): void {
    if (!this.app) {
      return;
    }

    this.app.destroy(true, { children: true });
    this.app = null;
    this.cardContainers.clear();
    this.activeDrag = null;
    this.expandedStackRootId = null;
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
    shadow.roundRect(5, 7, card.width, card.height, 14).fill({ color: 0x000000, alpha: 0.16 });

    const graphics = new Graphics();
    graphics.roundRect(0, 0, card.width, card.height, 14).fill(background).stroke({
      color: border.color,
      alpha: border.alpha,
      width: options.overlay ? 2 : 3,
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

    if (card.stack && card.stack.size > 1 && !options.overlay) {
      this.drawStackCount(container, card);

      if (card.stack.isTop) {
        this.drawRevealButton(container, card);
      }
    }

    container.on("pointerdown", (event) => this.handleCardPointerDown(event, card, container, Boolean(options.overlay)));

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

  private drawRevealButton(container: Container, card: CardViewModel): void {
    if (!card.stack) {
      return;
    }

    const button = new Container();
    button.position.set(card.width - 36, 8);
    button.eventMode = "static";
    button.cursor = "pointer";
    button.hitArea = new Rectangle(0, 0, 28, 24);

    const background = new Graphics();
    background.roundRect(0, 0, 28, 24, 8).fill({ color: 0xfff7dd, alpha: 0.96 }).stroke({
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
    icon.position.set(14, 12);

    button.addChild(background, icon);
    button.on("pointerdown", (event) => {
      event.stopPropagation();
      this.expandedStackRootId = this.expandedStackRootId === card.stack?.rootId ? null : card.stack?.rootId ?? null;

      if (this.currentViewModel) {
        this.update(this.currentViewModel);
      }
    });

    container.addChild(button);
  }

  private drawExpandedStack(viewModel: GameViewModel): void {
    if (!this.expandedStackRootId) {
      return;
    }

    const members = this.getStackMembers(viewModel, this.expandedStackRootId);

    if (members.length <= 1) {
      return;
    }

    const root = members[0];
    const panelWidth = Math.min(viewModel.table.width - 80, 56 + members.length * (root.width + 14));
    const panelHeight = root.height + 112;
    const panelX = clamp(root.x + 160, 40, viewModel.table.width - panelWidth - 40);
    const panelY = clamp(root.y - 36, 40, viewModel.table.height - panelHeight - 40);

    const panel = new Container();
    panel.position.set(panelX, panelY);
    panel.zIndex = 1_000_000;
    panel.eventMode = "static";
    panel.hitArea = new Rectangle(0, 0, panelWidth, panelHeight);

    const background = new Graphics();
    background.roundRect(0, 0, panelWidth, panelHeight, 18).fill({ color: 0xfff1ce, alpha: 0.96 }).stroke({
      color: 0x4b3825,
      width: 3,
    });

    const header = new Text({
      text: `Стопка ×${members.length}`,
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 20,
        fontWeight: "900",
        fill: 0x2b2118,
      },
    });
    header.position.set(18, 14);

    const hint = new Text({
      text: "Перетащи карту из стопки наружу",
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 13,
        fontWeight: "700",
        fill: 0x6a5846,
      },
    });
    hint.position.set(18, 42);

    const close = new Container();
    close.position.set(panelWidth - 36, 12);
    close.eventMode = "static";
    close.cursor = "pointer";
    close.hitArea = new Rectangle(0, 0, 24, 24);

    const closeBackground = new Graphics();
    closeBackground.roundRect(0, 0, 24, 24, 8).fill({ color: 0x2b2118, alpha: 0.12 });

    const closeIcon = new Text({
      text: "×",
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 18,
        fontWeight: "900",
        fill: 0x2b2118,
      },
    });
    closeIcon.anchor.set(0.5, 0.5);
    closeIcon.position.set(12, 11);
    close.addChild(closeBackground, closeIcon);
    close.on("pointerdown", (event) => {
      event.stopPropagation();
      this.expandedStackRootId = null;

      if (this.currentViewModel) {
        this.update(this.currentViewModel);
      }
    });

    panel.addChild(background, header, hint, close);
    this.overlayLayer.addChild(panel);

    members.forEach((card, index) => {
      const cardCopy = this.createCardContainer(card, {
        x: panelX + 20 + index * (card.width + 12),
        y: panelY + 72,
        z: 1_000_010 + index,
        overlay: true,
      });
      this.overlayLayer.addChild(cardCopy);
    });
  }

  private handleCardPointerDown = (event: unknown, card: CardViewModel, container: Container, fromOverlay: boolean): void => {
    if (!this.currentViewModel) {
      return;
    }

    const point = this.eventToTablePoint(event);
    const dragCardId = fromOverlay ? card.id : card.stack?.rootId ?? card.id;
    const stackMemberIds = !fromOverlay && card.stack ? card.stack.memberIds : [card.id];
    const draggedContainers = stackMemberIds
      .map((cardId) => this.cardContainers.get(cardId))
      .filter((candidate): candidate is Container => candidate !== undefined);

    const containers = fromOverlay || draggedContainers.length === 0 ? [container] : draggedContainers;

    this.activeDrag = {
      cardId: dragCardId,
      excludedCardIds: new Set(stackMemberIds),
      pointerStartX: point.x,
      pointerStartY: point.y,
      containers: containers.map((candidate, index) => {
        candidate.alpha = 0.92;
        candidate.cursor = "grabbing";
        candidate.zIndex = 100_000 + index;
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
    const targetCard = this.findTopCardAt(point.x, point.y, activeDrag.excludedCardIds);
    const targetZone = targetCard ? null : this.findZoneAt(point.x, point.y);

    this.activeDrag = null;

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

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
