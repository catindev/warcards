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
- Card feel pass:
  - карточки рисуются на image-template из приложенной карты (`src/assets/cardTemplate.ts`), а не как прямоугольники;
  - hover scale + outline;
  - drag lift, увеличенная тень и плавное движение с лагом;
  - drop transition / bounce при обновлении позиции;
  - подсветка допустимой цели во время drag-over;
  - idle-hop для овечки как пример auto movement.
- Stack UX:
  - карта на карте создаёт стопку;
  - по телу стопки вытаскивается верхняя карта;
  - отдельный handle `↕` рядом со стопкой тащит всю стопку;
  - иконка раскрытия `☰` находится рядом со стопкой, а не внутри карты;
  - при раскрытии стол блокируется и приглушается;
  - карты стопки приподнимаются над столом и раскладываются поверх него без отдельной панели-списка;
  - карту из раскрытой стопки можно вытащить обратно на стол или в зону.
- Process-stack visual prototype:
  - если в стопке есть `peasant + tree/mine/sheep`, над верхней картой показывается круговой progress indicator;
  - такая стопка слегка пульсирует.
- Базовые события:
  - `card.drag_started`
  - `card.dropped_on_empty`
  - `card.dropped_on_card`
  - `card.dropped_on_zone`
- Тесты на core runtime.

## Что намеренно не входит в первый срез

- Полноценная логика голода.
- Полноценное здоровье.
- Полноценный бой.
- Враги как gameplay system.
- Реальная тиковая симуляция с domain effects.
- Рецепты строительства как core system.
- Фермы, шахты и добыча как реальные механики.
- Реальные предметы/equipment: меч, щит, броня.
- Реальный sound layer.
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
2. Убедиться, что в статусе слева написано `Build: card-feel-image-animations-v3`.
3. Нажать `New game`.
4. Навести курсор на карту — карта должна чуть увеличиться и получить outline.
5. Потянуть карту — она должна приподняться, идти с лёгким лагом, а не как desktop icon.
6. Навести карту на другую карту — цель должна подсветиться.
7. Отпустить карту на пустом столе — должен быть settle/bounce.
8. Отпустить карту на другой карте — должна получиться стопка.
9. Потянуть верхнюю карту стопки за тело — должна вытаскиваться верхняя карта, а не вся стопка.
10. Потянуть `↕` рядом со стопкой — должна ехать вся стопка.
11. Нажать `☰` рядом со стопкой — стол должен приглушиться, а карты стопки разложиться поверх него.
12. Если собрать `Крестьянин + Дерево`, `Крестьянин + Шахта` или `Крестьянин + Овечка`, над стопкой должен появиться круговой progress indicator.
13. Перезагрузить страницу.
14. Нажать `Continue`.
15. Позиции карт и стопки должны восстановиться из localStorage.

## Следующие итерации

1. Добавить строгую JSON Schema для `GameRecipe` и `SaveSnapshot`.
2. Разделить prototype app и будущие пакеты `@warcards/core`, `@warcards/renderer-pixi`, `@warcards/player` или аналогичные.
3. Перенести process-stack из визуального прототипа в настоящую core simulation:
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
5. Добавить нормальный asset layer вместо встроенного data-url template.
6. Добавить sound layer и первые бумажные/стековые звуки.
