// The widget's drawing layer, as the root entrypoint and the widget reach it. The layer itself is
// the `drawings/layer` module tree: its contracts in `types`, the gesture grammar in `gestures`,
// the revisioned documents in `documents`, the tool presets in `presets`, and the composition that
// hands back a `DrawingsHandle` in `attach`.
export { attachDrawings, placeableByWidget } from './drawings/layer/attach'
export type {
  AttachDrawingsOptions,
  DrawingPresets,
  DrawingsEvents,
  DrawingsHandle,
  DrawingsWorkflow,
  PlacedImage,
  SelectedDrawing,
  TextEditSession,
} from './drawings/layer/types'
