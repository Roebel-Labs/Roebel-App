// Shared constants for the event poster proposals (Plakat-Vorschläge).
// Spec: docs/superpowers/specs/2026-09-22-event-poster-proposals-design.md

/** Render size: DIN A portrait within 0.2 % (1440/2032 = 1:1.411). Both multiples of 16. */
export const POSTER_WIDTH = 1440;
export const POSTER_HEIGHT = 2032;
export const POSTER_RENDER_SIZE = `${POSTER_WIDTH}x${POSTER_HEIGHT}`;

/** DIN A series height/width. */
export const A_SERIES_RATIO = Math.SQRT2;
/** ±8 % around √2 still counts as A-format (cover crops at most ~4 % per side). */
export const RATIO_TOLERANCE = 0.08;
/** Shortest side below this is treated as low resolution. */
export const LOW_RES_MIN_SIDE = 700;

export const DEFAULT_POSTER_MODEL = "gpt-image-2.5-sunburst";
export const DEFAULT_POSTER_QUALITY = "high";
export const OPENAI_IMAGES_BASE = "https://api.openai.com/v1/images";

export const POSTER_STORAGE_BUCKET = "images";
export const POSTER_STORAGE_FOLDER = "posters";
export const posterGeneratorLabel = (model: string) => `Röbel App / OpenAI ${model}`;

export const MAX_BATCHES_PER_DRAFT = 2;
export const MAX_BATCHES_PER_ACCOUNT_PER_DAY = 10;
export const DEFAULT_DAILY_BUDGET_USD = 20;
/** Anthropic vision rejects images above 5 MB; uploads are capped at 5 MB anyway. */
export const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;

export const SETTING_ENABLED = "poster_proposals_enabled";
export const SETTING_BUDGET = "poster_daily_budget_usd";
export const SETTING_MODEL = "poster_image_model";
