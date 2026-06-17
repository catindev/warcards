import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import type { CardId, CardViewModel, GameInputEvent, GameViewModel, ZoneViewModel } from "../core";
import type { TableRendererPort } from "../player/TablePlayer";

interface ActiveDrag {
  cardId: CardId;
  offsetX: number;
  offsetY: number;
}

interface ParsedColor {
  color: number;
  alpha: number;
}

export class PixiTableRenderer implements TableRendererPort {
  private app: Application | null = null;
  private inputHandler: (event: GameInputEvent) => void = () => undefined;
  private currentViewModel: GameViewModel | null = null;
  private activeDrag: ActiveDrag | null = null;

  private readonly tableLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly cardLayer = new Container();
  private readonly dragLayer = new Container();
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
    this.cardLayer.sortableChildren = true;
    this.dragLayer.sortableChildren = true;

    app.stage.addChild(this.tableLayer, this.zoneLayer, this.cardLayer, this.dragLayer);

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

    this.cardContainers.clear();
    this.tableLayer.removeChildren();
    this.zoneLayer.removeChildren();
    this.cardLayer.removeChildren();
    this.dragLayer.removeChildren();

    this.drawTable(viewModel);
    this.drawZones(viewModel.zones);
    this.drawCards(viewModel.cards);
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
  }

  screenToTable(clientX: number, clientY: number): { x: number; y: number } {
    const app = this.requireApp();
    const viewModel = this.requireViewModel();
    const rect = app.canvas.getBoundingClientRect();

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
      const cardContainer = this.createCardContainer(card);
      this.cardContainers.set(card.id, cardContainer);
      this.cardLayer.addChild(cardContainer);
    }
  }

  private createCardContainer(card: CardViewModel): Container {
    const background = parseColor(card.style.background);
    const border = parseColor(card.style.border);
    const textColor = parseColor(card.style.text);
    const container = new Container();
    container.position.set(card.x, card.y);
    container.zIndex = card.z;
    container.eventMode = card.draggable ? "static" : "none";
    container.cursor = card.draggable ? "grab" : "default";

    const graphics = new Graphics();
    graphics.roundRect(0, 0, card.width, card.height, 14).fill(background).stroke({
      color: border.color,
      alpha: border.alpha,
      width: 3,
    });

    const icon = new Text({
      text: card.icon,
      style: {
        fontFamily: "Georgia, serif",
        fontSize: 48,
        fill: textColor.color,
      },
    });
    icon.anchor.set(0.5, 0.5);
    icon.position.set(card.width / 2, 56);

    const title = new Text({
      text: card.title,
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 14,
        fontWeight: "800",
        fill: textColor.color,
        align: "center",
        wordWrap: true,
        wordWrapWidth: card.width - 16,
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(card.width / 2, 108);

    container.addChild(graphics, icon, title);
    container.on("pointerdown", (event) => this.handleCardPointerDown(event, card));

    return container;
  }

  private handleCardPointerDown = (event: unknown, card: CardViewModel): void => {
    if (!this.currentViewModel) {
      return;
    }

    const point = this.eventToTablePoint(event);
    const container = this.cardContainers.get(card.id);

    if (!container) {
      return;
    }

    this.activeDrag = {
      cardId: card.id,
      offsetX: point.x - card.x,
      offsetY: point.y - card.y,
    };

    container.alpha = 0.9;
    container.cursor = "grabbing";
    container.zIndex = 100_000;
    this.dragLayer.addChild(container);

    this.inputHandler({
      type: "card.drag_started",
      cardId: card.id,
      x: point.x,
      y: point.y,
    });
  };

  private handlePointerMove = (event: unknown): void => {
    if (!this.activeDrag) {
      return;
    }

    const container = this.cardContainers.get(this.activeDrag.cardId);

    if (!container) {
      return;
    }

    const point = this.eventToTablePoint(event);
    container.position.set(point.x - this.activeDrag.offsetX, point.y - this.activeDrag.offsetY);
  };

  private handlePointerUp = (event: unknown): void => {
    if (!this.activeDrag || !this.currentViewModel) {
      return;
    }

    const activeDrag = this.activeDrag;
    const point = this.eventToTablePoint(event);
    const targetCard = this.findTopCardAt(point.x, point.y, activeDrag.cardId);
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
        x: point.x,
        y: point.y,
      });
    } else {
      this.inputHandler({
        type: "card.dropped_on_empty",
        cardId: activeDrag.cardId,
        x: point.x,
        y: point.y,
      });
    }

    if (this.currentViewModel) {
      this.update(this.currentViewModel);
    }
  };

  private findTopCardAt(x: number, y: number, excludeCardId: CardId): CardViewModel | null {
    const viewModel = this.requireViewModel();

    return [...viewModel.cards]
      .filter((card) => card.id !== excludeCardId)
      .sort((a, b) => b.z - a.z)
      .find((card) => x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height) ?? null;
  }

  private findZoneAt(x: number, y: number): ZoneViewModel | null {
    const viewModel = this.requireViewModel();

    return viewModel.zones.find((zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) ?? null;
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
