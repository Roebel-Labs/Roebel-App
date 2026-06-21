import { ROEBEL_GROUP } from "./circles";

// The network-of-towns model: Röbel is the one REAL town-group today; the rest are
// labeled placeholders to convey Stage-2 federation (a meta-group trusting verified
// town currencies). When town #2 launches, add it here with its group address.
export interface Town {
  id: string;
  name: string;
  group?: string;
  real: boolean;
}

export const META_GROUP_LABEL = "Verified Towns";

export const TOWNS: Town[] = [
  { id: "roebel", name: "Röbel / Müritz", group: ROEBEL_GROUP, real: true },
  { id: "future-1", name: "Town #2", real: false },
  { id: "future-2", name: "Town #3", real: false },
  { id: "future-3", name: "Town #4", real: false },
];
