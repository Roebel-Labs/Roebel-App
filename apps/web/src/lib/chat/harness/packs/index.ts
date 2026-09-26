// Every tool pack, registered once by registry.ensurePacks(). Static imports
// only; each pack exports `register(registry)` and calls registry.registerTool.
import type { ToolRegistry } from "../types";
import * as chat from "./chat";
import * as memory from "../memory";
import * as actionsTest from "./actions-test";
import * as roebelRead from "./roebel-read";
import * as userPrivate from "./user-private";
import * as web from "./web";

const PACKS: { register: (registry: ToolRegistry) => void }[] = [
  chat, memory, roebelRead, userPrivate, web, actionsTest,
];

export function registerAllPacks(registry: ToolRegistry): void {
  for (const pack of PACKS) pack.register(registry);
}
