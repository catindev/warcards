# Warcards

Минимальный прототип карточной RTS-платформы: **game recipe → runtime state → save snapshot → view model → Pixi renderer**.

Сейчас это не сама игра с голодом, фермой и врагами. Это первый вертикальный срез стола, на котором потом будет собираться игра.

## Что уже есть

- `GameRecipe` v0.1: стол, зоны, определения карт, стартовое состояние.
- `GameState` v0.1: session, table id, card instances, card locations.
- `CardLocation`: `table`, `zone`, `stack`.
- `SaveSnapshot` v0.1: сохранение runtime state с `recipeRef`.
- `LocalStorageSaveStore`: браузерное autosave-хранилище.
- `TablePlayer`: связывает recipe, state, save store и renderer.
- `PixiTableRenderer`: рисует стол, зоны и карты; эмитит drag/drop events.
- Базовые события:
  - `card.drag_started`
  - `card.dropped_on_empty`
  - `card.dropped_on_card`
  - `card.dropped_on_zone`
- Тесты на core runtime.

## Что намеренно не входит в первый срез

- Голод.
- Здоровье.
- Бой.
- Враги.
- Тиковая симуляция.
- Рецепты строительства.
- Фермы, шахты и добыча как реальные механики.
- Звуки.
- Редактор.

Эти системы должны добавляться поверх уже разделённых слоёв, а не смешиваться с renderer или browser storage.

## Архитектурные границы

```text
Recipe
  описывает игру и стартовое состояние

GameState
  хранит только mutable runtime state партии

Player
  держит текущую session, применяет input events, сохраняет state

Renderer
  получает GameViewModel, рисует и возвращает semantic input events

SaveStore
  физически хранит SaveSnapshot, сейчас через localStorage
```

Renderer не меняет authoritative state. Он может временно двигать карту во время drag, но после drop отправляет событие наверх. State меняется только через core reducer.

## Запуск

```bash
npm install
npm run dev
```

Проверка:

```bash
npm run typecheck
npm test
npm run build
```

## Ручной сценарий проверки

1. Открыть приложение.
2. Нажать `New game`.
3. Перетащить карту на пустое место стола.
4. Перетащить карту на другую карту — она должна лечь в stack.
5. Перетащить карту в левую или правую зону.
6. Перезагрузить страницу.
7. Нажать `Continue`.
8. Позиции карт должны восстановиться из localStorage.

## Следующие итерации

1. Добавить строгую JSON Schema для `GameRecipe` и `SaveSnapshot`.
2. Разделить prototype app и будущие пакеты `@warcards/core`, `@warcards/renderer-pixi`, `@warcards/player` или аналогичные.
3. Добавить первые real gameplay systems:
   - job system,
   - resource source,
   - hunger/food,
   - production,
   - combat/enemy targeting.
4. Добавить нормальный asset layer вместо текстовых glyph-иконок.
5. Добавить CI: typecheck, tests, build.
