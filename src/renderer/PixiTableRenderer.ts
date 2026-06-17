import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { CARD_TEMPLATE_DATA_URL } from "../assets/cardTemplate";
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
  targetDx: number;
  targetDy: number;
  currentDx: number;
  currentDy: number;
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
  forceInteractive?: boolean;
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

interface VisualBase {
  x: number;
  y: number;
  z: number;
  card: CardViewModel;
}

interface Point {
  x: number;
  y: number;
}

const CARD_SPRING_MS = 190;
const DROP_BOUNCE_MS = 240;
const STACK_ACCEPT_MS = 180;
const PROCESS_DURATION_MS = 2600;

export class PixiTableRenderer implements TableRendererPort {
  private app: Application | null = null;
  private inputHandler: (event: GameInputEvent) => void = () => undefined;
  private currentViewModel: GameViewModel | null = null;
  private activeDrag: ActiveDrag | null = null;
  private dragAnimationFrameId: number | null = null;
  private modalStack: ModalStackState | null = null;
  private modalAnimationFrameId: number | null = null;
  private readonly cardTemplateTexture = Texture.from(CARD_TEMPLATE_DATA_URL);

  private readonly worldLayer = new Container();
  private readonly tableLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly cardLayer = new Container();
  private readonly processLayer = new Container();
  private readonly affordanceLayer = new Container();
  private readonly dragLayer = new Container();
  private readonly revealHandleLayer = new Container();
  private readonly modalScrimLayer = new Container();
  private readonly modalLayer = new Container();
  private readonly cardContainers = new Map<CardId, Container>();
  private readonly cardBase = new Map<CardId, VisualBase>();
  private readonly lastCardPositions = new Map<CardId, Point>();
  private hoverTargetId: CardId | null = null;

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
    this.processLayer.zIndex = 24;
    this.affordanceLayer.zIndex = 26;

    this.worldLayer.sortableChildren = true;
    this.cardLayer.sortableChildren = true;
    this.dragLayer.sortableChildren = true;
    this.revealHandleLayer.sortableChildren = true;
    this.modalLayer.sortableChildren = true;

    this.worldLayer.addChild(this.tableLayer, this.zoneLayer, this.cardLayer, this.processLayer, this.affordanceLayer);
    app.stage.addChild(this.worldLayer, this.dragLayer, this.revealHandleLayer, this.modalScrimLayer, this.modalLayer);
    app.ticker.add(this.handleTicker);

    if (this.currentViewModel) {
      this.update(this.currentViewModel);
    }
  }

  update(viewModel: GameViewModel): void {
    const previousPositions = new Map(this.lastCardPositions);
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
    this.cardBase.clear();
    this.tableLayer.removeChildren();
    this.zoneLayer.removeChildren();
    this.cardLayer.removeChildren();
    this.processLayer.removeChildren();
    this.affordanceLayer.removeChildren();
    this.dragLayer.removeChildren();
    this.revealHandleLayer.removeChildren();
    this.modalScrimLayer.removeChildren();
    this.modalLayer.removeChildren();

    this.drawTable(viewModel);
    this.drawZones(viewModel.zones);
    this.drawCards(viewModel.cards, previousPositions);
    this.drawStackControls(viewModel.cards);
    this.drawProcessIndicators();

    this.lastCardPositions.clear();
    for (const card of viewModel.cards) {
      this.lastCardPositions.set(card.id, { x: card.x, y: card.y });
    }

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

    if (this.dragAnimationFrameId !== null) {
      cancelAnimationFrame(this.dragAnimationFrameId);
      this.dragAnimationFrameId = null;
    }

    if (!this.app) {
      return;
    }

    this.app.destroy(true, { children: true });
    this.app = null;
    this.cardContainers.clear();
    this.cardBase.clear();
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

  private drawCards(cards: CardViewModel[], previousPositions: Map<CardId, Point>): void {
    for (const card of cards) {
      const previous = previousPositions.get(card.id);
      const shouldAnimate = previous && distance(previous, card) > 1 && !this.modalStack;
      const cardContainer = this.createCardContainer(card, {
        x: shouldAnimate ? previous.x : card.x,
        y: shouldAnimate ? previous.y : card.y,
        register: true,
      });

      this.cardLayer.addChild(cardContainer);
      this.cardBase.set(card.id, { x: card.x, y: card.y, z: card.z, card });

      if (shouldAnimate) {
        this.animateCardSettle(cardContainer, card.x, card.y, card.stack ? STACK_ACCEPT_MS : DROP_BOUNCE_MS);
      }
    }
  }

  private createCardContainer(card: CardViewModel, options: CardRenderOptions = {}): Container {
    const textColor = parseColor(card.style.text);
    const container = new Container();
    const canInteract = Boolean(options.forceInteractive || options.modal || !card.stack || card.stack.isTop);
    container.position.set(options.x ?? card.x, options.y ?? card.y);
    container.zIndex = options.z ?? card.z;
    container.eventMode = card.draggable && canInteract ? "static" : "none";
    container.cursor = card.draggable && canInteract ? "grab" : "default";
    container.hitArea = new Rectangle(0, 0, card.width, card.height);

    const shadow = new Graphics();
    shadow.name = "cardShadow";
    shadow.roundRect(8, 11, card.width - 2, card.height - 2, 18).fill({ color: 0x000000, alpha: options.modal ? 0.26 : 0.18 });

    const paper = new Sprite(this.cardTemplateTexture);
    paper.width = card.width;
    paper.height = card.height;
    paper.alpha = 0.98;

    const wash = new Graphics();
    wash.roundRect(10, 10, card.width - 20, card.height - 20, 10).fill({
      color: parseColor(card.style.background).color,
      alpha: 0.10,
    });

    const outline = new Graphics();
    outline.name = "hoverOutline";
    outline.roundRect(-4, -4, card.width + 8, card.height + 8, 18).stroke({ color: 0xffffff, alpha: 0.95, width: 4 });
    outline.visible = false;

    const icon = new Text({
      text: card.icon,
      style: {
        fontFamily: "Georgia, serif",
        fontSize: 44,
        fill: textColor.color,
      },
    });
    icon.anchor.set(0.5, 0.5);
    icon.position.set(card.width / 2, 66);

    const title = new Text({
      text: card.title,
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 14,
        fontWeight: "900",
        fill: textColor.color,
        align: "center",
        wordWrap: true,
        wordWrapWidth: card.width - 18,
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(card.width / 2, 124);

    container.addChild(shadow, outline, paper, wash, icon, title);

    if (card.stack && card.stack.size > 1 && !options.modal) {
      this.drawStackCount(container, card);
    }

    container.on("pointerdown", (event) => this.handleCardPointerDown(event, card, container, Boolean(options.modal)));
    container.on("pointerover", () => this.setCardHover(container, outline, true, options.modal));
    container.on("pointerout", () => this.setCardHover(container, outline, false, options.modal));

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
    badgeBackground.roundRect(0, 0, 36, 23, 10).fill({ color: 0x2b2118, alpha: 0.84 });

    const count = new Text({
      text: `×${card.stack.size}`,
      style: {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "900",
        fill: 0xfff7dd,
      },
    });
    count.anchor.set(0.5, 0.5);
    count.position.set(18, 11.5);

    badge.addChild(badgeBackground, count);
    container.addChild(badge);
  }

  private drawStackControls(cards: CardViewModel[]): void {
    if (this.modalStack) {
      return;
    }

    const topStackCards = cards.filter((card) => card.stack?.isTop);

    for (const card of topStackCards) {
      this.drawRoundHandle({
        x: card.x + card.width + 10,
        y: card.y + 8,
        icon: "☰",
        title: "Раскрыть стопку",
        onDown: () => this.openStackModal(card.stack?.rootId ?? card.id),
      });
      this.drawRoundHandle({
        x: card.x + card.width + 10,
        y: card.y + 48,
        icon: "↕",
        title: "Перетащить всю стопку",
        onDown: (event) => this.startWholeStackDrag(event, card),
      });
    }
  }

  private drawRoundHandle(options: { x: number; y: number; icon: string; title: string; onDown: (event: unknown) => void }): void {
    const button = new Container();
    button.position.set(options.x, options.y);
    button.zIndex = 200_000;
    button.eventMode = "static";
    button.cursor = "pointer";
    button.hitArea = new Rectangle(0, 0, 34, 34);
    button.label = options.title;

    const background = new Graphics();
    background.circle(17, 17, 17).fill({ color: 0xfff7dd, alpha: 0.98 }).stroke({
      color: 0x4b3825,
      width: 2,
    });

    const icon = new Text({
      text: options.icon,
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
      options.onDown(event);
    });

    this.revealHandleLayer.addChild(button);
  }

  private startWholeStackDrag(event: unknown, card: CardViewModel): void {
    if (!card.stack) {
      return;
    }

    const rootId = card.stack.rootId;
    const memberIds = card.stack.memberIds;
    const point = this.eventToTablePoint(event);
    this.startDrag(memberIds, rootId, point, false);
  }

  private openStackModal(rootId: CardId): void {
    const viewModel = this.requireViewModel();
    const members = this.getStackMembers(viewModel, rootId);

    if (members.length <= 1) {
      return;
    }

    this.cancelModalAnimation();
    const centerX = viewModel.table.width / 2;
    const centerY = viewModel.table.height / 2;
    const gap = Math.min(150, Math.max(100, 680 / Math.max(1, members.length - 1)));
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
          forceInteractive: true,
        });
        const normalized = members.length === 1 ? 0 : index / (members.length - 1) - 0.5;

        return {
          card,
          container,
          startX: card.x,
          startY: card.y,
          targetX: startX + index * gap,
          targetY: centerY - 92 - Math.abs(normalized) * 42,
          targetRotation: normalized * 0.25,
          targetScale: 1.18,
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
    this.cancelModalAnimation();
    this.modalStack = null;
    this.modalLayer.removeChildren();
    this.modalScrimLayer.removeChildren();
    this.setWorldBlocked(false);
  }

  private setWorldBlocked(blocked: boolean): void {
    this.worldLayer.alpha = blocked ? 0.38 : 1;
    this.worldLayer.scale.set(blocked ? 0.992 : 1);
  }

  private animateModalTo(target: 0 | 1, onDone?: () => void): void {
    if (!this.modalStack) {
      return;
    }

    this.cancelModalAnimation();
    const startedAt = performance.now();
    const durationMs = 220;
    const initial = this.modalStack.progress;

    const tick = (timestamp: number): void => {
      if (!this.modalStack) {
        return;
      }

      const raw = Math.min(1, (timestamp - startedAt) / durationMs);
      const eased = easeOutBack(raw);
      this.modalStack.progress = clamp01(initial + (target - initial) * eased);
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

  private cancelModalAnimation(): void {
    if (this.modalAnimationFrameId !== null) {
      cancelAnimationFrame(this.modalAnimationFrameId);
      this.modalAnimationFrameId = null;
    }
  }

  private drawModalStack(): void {
    this.modalLayer.removeChildren();
    this.modalScrimLayer.removeChildren();

    if (!this.modalStack) {
      return;
    }

    const viewModel = this.requireViewModel();
    const scrim = new Graphics();
    scrim.rect(0, 0, viewModel.table.width, viewModel.table.height).fill({ color: 0xd8d8d8, alpha: 0.34 });
    scrim.rect(0, 0, viewModel.table.width, viewModel.table.height).fill({ color: 0x000000, alpha: 0.32 });
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
    this.startDrag([card.id], card.id, point, fromModal, container);
  };

  private startDrag(memberIds: CardId[], dragCardId: CardId, point: Point, fromModal: boolean, modalContainer?: Container): void {
    const draggedContainers = fromModal && modalContainer
      ? [modalContainer]
      : memberIds
          .map((cardId) => this.cardContainers.get(cardId))
          .filter((candidate): candidate is Container => candidate !== undefined);

    if (draggedContainers.length === 0) {
      return;
    }

    this.activeDrag = {
      cardId: dragCardId,
      excludedCardIds: new Set(memberIds),
      pointerStartX: point.x,
      pointerStartY: point.y,
      targetDx: 0,
      targetDy: 0,
      currentDx: 0,
      currentDy: 0,
      fromModal,
      containers: draggedContainers.map((candidate, index) => {
        candidate.alpha = 0.95;
        candidate.cursor = "grabbing";
        candidate.zIndex = 1_200_000 + index;
        candidate.scale.set(fromModal ? candidate.scale.x : 1.06);
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

    this.startDragAnimationLoop();
  }

  private handlePointerMove = (event: unknown): void => {
    if (!this.activeDrag) {
      return;
    }

    const point = this.eventToTablePoint(event);
    this.activeDrag.targetDx = point.x - this.activeDrag.pointerStartX;
    this.activeDrag.targetDy = point.y - this.activeDrag.pointerStartY;
    this.drawDragAffordance(point);
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

    this.stopDragAnimationLoop();
    this.affordanceLayer.removeChildren();
    this.hoverTargetId = null;
    this.activeDrag = null;

    if (activeDrag.fromModal) {
      this.clearModalStack();
    }

    if (targetCard) {
      this.animateStackAccept(primary);
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

  private startDragAnimationLoop(): void {
    if (this.dragAnimationFrameId !== null) {
      return;
    }

    const tick = (): void => {
      if (!this.activeDrag) {
        this.dragAnimationFrameId = null;
        return;
      }

      this.activeDrag.currentDx += (this.activeDrag.targetDx - this.activeDrag.currentDx) * 0.34;
      this.activeDrag.currentDy += (this.activeDrag.targetDy - this.activeDrag.currentDy) * 0.34;

      for (const dragged of this.activeDrag.containers) {
        dragged.container.position.set(dragged.startX + this.activeDrag.currentDx, dragged.startY + this.activeDrag.currentDy);
      }

      this.dragAnimationFrameId = requestAnimationFrame(tick);
    };

    this.dragAnimationFrameId = requestAnimationFrame(tick);
  }

  private stopDragAnimationLoop(): void {
    if (this.dragAnimationFrameId !== null) {
      cancelAnimationFrame(this.dragAnimationFrameId);
      this.dragAnimationFrameId = null;
    }
  }

  private drawDragAffordance(point: Point): void {
    if (!this.activeDrag || this.modalStack) {
      return;
    }

    const target = this.findTopCardAt(point.x, point.y, this.activeDrag.excludedCardIds);

    if (target?.id === this.hoverTargetId) {
      return;
    }

    this.hoverTargetId = target?.id ?? null;
    this.affordanceLayer.removeChildren();

    if (!target) {
      return;
    }

    const glow = new Graphics();
    glow.roundRect(target.x - 8, target.y - 8, target.width + 16, target.height + 16, 22).stroke({
      color: 0xa7f3a0,
      alpha: 0.9,
      width: 5,
    });
    glow.roundRect(target.x - 14, target.y - 14, target.width + 28, target.height + 28, 26).stroke({
      color: 0xa7f3a0,
      alpha: 0.28,
      width: 10,
    });
    this.affordanceLayer.addChild(glow);
  }

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

  private isProcessStack(card: CardViewModel): boolean {
    if (!this.currentViewModel || !card.stack?.isTop || card.stack.size < 2) {
      return false;
    }

    const members = this.getStackMembers(this.currentViewModel, card.stack.rootId).map((member) => member.defId);
    const hasPeasant = members.includes("peasant");
    return hasPeasant && (members.includes("tree") || members.includes("mine") || members.includes("sheep"));
  }

  private drawProcessIndicators(): void {
    this.processLayer.removeChildren();

    if (!this.currentViewModel) {
      return;
    }

    const time = performance.now();

    for (const card of this.currentViewModel.cards) {
      if (!this.isProcessStack(card)) {
        continue;
      }

      const progress = (time % PROCESS_DURATION_MS) / PROCESS_DURATION_MS;
      const pulse = 1 + Math.sin(progress * Math.PI * 2) * 0.018;
      const container = this.cardContainers.get(card.id);

      if (container && !this.activeDrag) {
        container.scale.set(pulse);
      }

      const ring = new Graphics();
      const cx = card.x + card.width / 2;
      const cy = card.y - 16;
      ring.circle(cx, cy, 12).stroke({ color: 0x2b2118, alpha: 0.28, width: 4 });
      ring.arc(cx, cy, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress).stroke({ color: 0x3d7d28, alpha: 0.95, width: 4 });
      this.processLayer.addChild(ring);
    }
  }

  private handleTicker = (): void => {
    if (!this.currentViewModel || !this.app) {
      return;
    }

    this.drawProcessIndicators();

    if (this.activeDrag || this.modalStack) {
      return;
    }

    const now = performance.now();

    for (const [cardId, base] of this.cardBase.entries()) {
      const container = this.cardContainers.get(cardId);

      if (!container) {
        continue;
      }

      if (base.card.defId === "sheep" && !base.card.stack) {
        const phase = ((now + stableHash(cardId) * 17) % 2600) / 2600;
        const hop = phase < 0.22 ? -Math.sin((phase / 0.22) * Math.PI) * 12 : 0;
        container.position.set(base.x, base.y + hop);
        container.scale.set(phase < 0.22 ? 1 + Math.sin((phase / 0.22) * Math.PI) * 0.035 : 1);
      }
    }
  };

  private setCardHover(container: Container, outline: Graphics, active: boolean, modal: boolean | undefined): void {
    if (this.activeDrag || (this.modalStack && !modal)) {
      return;
    }

    outline.visible = active;
    this.animateScale(container, active ? 1.055 : 1, CARD_SPRING_MS);
  }

  private animateCardSettle(container: Container, targetX: number, targetY: number, durationMs: number): void {
    const startX = container.x;
    const startY = container.y;
    const start = performance.now();

    const tick = (timestamp: number): void => {
      const raw = Math.min(1, (timestamp - start) / durationMs);
      const eased = easeOutBack(raw);
      container.position.set(lerp(startX, targetX, eased), lerp(startY, targetY, eased));
      container.scale.set(1 + Math.sin(raw * Math.PI) * 0.035);

      if (raw < 1 && !container.destroyed) {
        requestAnimationFrame(tick);
        return;
      }

      if (!container.destroyed) {
        container.position.set(targetX, targetY);
        container.scale.set(1);
      }
    };

    requestAnimationFrame(tick);
  }

  private animateStackAccept(container: Container | undefined): void {
    if (!container) {
      return;
    }

    this.animateScale(container, 0.92, 80, () => this.animateScale(container, 1.02, 120));
  }

  private animateScale(container: Container, targetScale: number, durationMs: number, onDone?: () => void): void {
    const startScale = container.scale.x;
    const start = performance.now();

    const tick = (timestamp: number): void => {
      const raw = Math.min(1, (timestamp - start) / durationMs);
      const eased = 1 - Math.pow(1 - raw, 3);
      const scale = lerp(startScale, targetScale, eased);
      container.scale.set(scale);

      if (raw < 1 && !container.destroyed) {
        requestAnimationFrame(tick);
        return;
      }

      if (!container.destroyed) {
        container.scale.set(targetScale);
        onDone?.();
      }
    };

    requestAnimationFrame(tick);
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

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function stopEvent(event: unknown): void {
  const maybeEvent = event as { stopPropagation?: () => void };
  maybeEvent.stopPropagation?.();
}
