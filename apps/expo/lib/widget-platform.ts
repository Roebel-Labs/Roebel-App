/**
 * Hand-off of the widget payload to the OS. Platform files (widget-platform.ios.ts /
 * widget-platform.android.ts) do the real work; web has no widgets.
 */
import type { WidgetPayload } from './widget-payload';

export async function pushToPlatform(_payload: WidgetPayload): Promise<void> {}
