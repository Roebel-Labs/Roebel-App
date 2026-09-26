// A tool-input problem the model should see verbatim (German): ambiguous
// recipient, invalid amount, missing gate. The registry returns its message as
// `{ error }` instead of the generic "Werkzeug fehlgeschlagen" text, and a
// preview/signRequest that throws one never creates an approval card.
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function isToolInputError(err: unknown): err is ToolInputError {
  return err instanceof ToolInputError || (err instanceof Error && err.name === "ToolInputError");
}
