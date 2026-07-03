/**
 * Model selection for the AI Mini App Builder codegen.
 *
 * We use a STRONG model for code generation (not the Haiku model Mecky uses).
 * `claude-sonnet-5` is fast and excellent at code; `claude-opus-4-8` is the
 * override for the hardest prompts. The @ai-sdk/anthropic provider passes the
 * model id straight through to the API, so these ids work even if the installed
 * provider's autocomplete union predates them.
 */
export const CODEGEN_MODEL_DEFAULT = "claude-sonnet-5" as const;
export const CODEGEN_MODEL_HARD = "claude-opus-4-8" as const;

/** Pick the codegen model. Pass `complexity: "hard"` for the toughest prompts. */
export function codegenModelId(complexity: "default" | "hard" = "default"): string {
  return complexity === "hard" ? CODEGEN_MODEL_HARD : CODEGEN_MODEL_DEFAULT;
}
