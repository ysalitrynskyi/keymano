// Compatibility wrapper: public props stay stable while internals split into
// controller/view/hooks.

import { KeyboardController } from "./KeyboardController";

export function Keyboard({
  onEditKey,
  onContextKey,
}: {
  onEditKey: (code: number) => void;
  onContextKey?: (code: number, x: number, y: number) => void;
}) {
  return <KeyboardController onEditKey={onEditKey} onContextKey={onContextKey} />;
}
