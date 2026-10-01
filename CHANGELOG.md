# @trdrs/quickcharts

## 1.2.0

Hosts can supply scoped legend rows and open a named indicator collection. Chart dialogs and replay controls animate their opening and closing.

Every duration, timing function and motion scale is a theme role in the `motion` family, which a host's palette retunes and a reduced-motion preference resolves to no motion: `motion.durationModerate`, `motion.durationSlow`, `motion.durationSlower`, `motion.easingStandard`, `motion.easingOut`, `motion.easingLinear`, `motion.easingSpring` and `motion.scaleEnter` join `motion.durationFast` and `motion.durationBase`, and `ThemeRoleKind` includes `easing` and `scale`. A modal dialog fades its backdrop in and fades and scales its box from `motion.scaleEnter`, over `motion.durationBase`.

The symbol search offers its classes and spread operators as the host configures them: `search.spreads` switches spreads off or offers only the listed operators (`SpreadOperatorId`), `search.allClasses` hides or renames the All chip, and `search.classSelection: 'multiple'` lets the viewer select several classes, which the feed receives as `classes` (`DatafeedSearchOptions`). A feed's `config().classes` may declare a class with narrower classes (`SearchClassNode`), which the search offers in a second row of chips. `openSymbolSearch` and `mountSymbolSearch` take the same options.

## 1.1.0

The symbol search can name what it is limited to, with a host-painted mark, beside the asset-class filters (`search.scope`, `SearchScope`).

## 1.0.1

Emoji drawings and the picker use bundled Twemoji artwork without a host asset server.
Hosts may supply an image intake port while keeping the bundled emoji artwork.

## 1.0.0

- A complete browser chart over host-supplied market data and storage, with seven chart styles,
  23 built-in indicators, 90 drawings, comparison series, 55 layouts and data replay.
- Typed chart, drawing and persistence APIs with TypeScript declarations and ESM exports.
- Default chart controls, independent control visibility, custom icon factories, toolbar slots
  and themed host controls over the same chart commands.
- Root-scoped styling with light and dark palettes, typed themes and documented styling hooks.
- Multi-asset price formatting, sessions, timezones, symbol search and 21 interface languages.
- Chart image export, fullscreen, keyboard commands and saved layouts.
- Public entries: `@trdrs/quickcharts`, `@trdrs/quickcharts/drawings`, `@trdrs/quickcharts/adapters/rest` and
  `@trdrs/quickcharts/styles.css`. The required renderer is resolved automatically by supported npm
  versions when installing `@trdrs/quickcharts` with default peer resolution.
- Apache-2.0 license and third-party notices accompany the package.
