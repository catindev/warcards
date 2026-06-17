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
- Stack UX:
  - карта на карте создаёт стопку;
  - закрытая стопка таскается как группа;
  - иконка раскрытия стопки находится рядом со стопкой, а не внутри карты;
  - при раскрытии стол блокируется и приглушается;
  - карты стопки приподнимаются над столом и раскладываются поверх него без отдельной панели-списка;
  - карту из раскрытой стопки можно вытащить обратно на стол или в зону.
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
- Реальные предметы/equipment: меч, щит, броня.
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

Renderer не меняет authoritative state. Он может временно двигать карту, закрытую стопку или раскрытую modal-карту во время drag, но после drop отправляет событие наверх. State меняется только через core reducer.

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
4. Перетащить карту на другую карту — она должна лечь в стопку.
5. Перетащить третью карту на любую карту из этой стопки — она должна добавиться в ту же стопку.
6. Потянуть закрытую стопку — она должна ехать как группа.
7. Нажать маленькую кнопку `☰` рядом со стопкой.
8. Стол должен приглушиться и стать неактивным, а карты стопки должны разложиться поверх стола.
9. Перетащить одну карту из раскрытой стопки наружу — она должна отделиться от стопки.
10. Кликнуть по приглушённому столу или `×`, чтобы закрыть раскрытие стопки.
11. Перетащить карту в левую или правую зону.
12. Перезагрузить страницу.
13. Нажать `Continue`.
14. Позиции карт и стопки должны восстановиться из localStorage.

## Следующие итерации

1. Добавить строгую JSON Schema для `GameRecipe` и `SaveSnapshot`.
2. Разделить prototype app и будущие пакеты `@warcards/core`, `@warcards/renderer-pixi`, `@warcards/player` или аналогичные.
3. Добавить первые real gameplay systems:
   - job system,
   - resource source,
   - hunger/food,
   - production,
   - combat/enemy targeting.
4. Добавить equipment/components для предметов на персонаже:
   - `EquippableDef` для меча/щита/брони;
   - `EquipmentState` у персонажа;
   - эффекты предметов на атаку/броню;
   - recipe `peasant + sword + shield + barracks -> warrior`.
5. Добавить нормальный asset layer вместо текстовых glyph-иконок.
6. Добавить CI: typecheck, tests, build.
