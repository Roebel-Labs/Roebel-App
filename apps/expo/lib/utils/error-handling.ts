/**
 * Error handling utilities for Anthropic API calls
 * Provides retry logic, rate limiting detection, and user-friendly error messages
 */

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}s`);
    this.name = "RateLimitError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Network errors (connection failures, timeouts)
  if (
    error instanceof NetworkError ||
    error.name === "TypeError" ||
    error.message?.includes("network") ||
    error.message?.includes("fetch failed")
  ) {
    return true;
  }

  // Rate limit errors (429)
  if (error instanceof RateLimitError || error.status === 429) {
    return true;
  }

  // Server errors (500, 502, 503, 504)
  if (error instanceof APIError && error.status >= 500) {
    return true;
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = i === maxRetries - 1;

      if (isLastAttempt) {
        throw error;
      }

      const isRetryable = isRetryableError(error);
      if (!isRetryable) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = baseDelay * Math.pow(2, i);

      // For rate limit errors, use the retry-after header if available
      if (error instanceof RateLimitError) {
        delay = Math.max(delay, error.retryAfter * 1000);
      }

      // Add jitter to prevent thundering herd
      delay = delay + Math.random() * 1000;

      console.log(
        `Retry attempt ${i + 1}/${maxRetries} after ${Math.round(delay)}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * Handle HTTP response and throw appropriate errors
 */
export function handleAPIResponse(response: Response): void {
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") || "60", 10);
    throw new RateLimitError(retryAfter);
  }

  if (response.status === 401 || response.status === 403) {
    throw new APIError(
      response.status,
      "Authentication error. Please check your API key."
    );
  }

  if (response.status >= 500) {
    throw new APIError(
      response.status,
      `Server error: ${response.status} ${response.statusText}`
    );
  }

  if (!response.ok) {
    throw new APIError(
      response.status,
      `API error: ${response.status} ${response.statusText}`
    );
  }
}

/**
 * Get user-friendly error message in German
 */
export function getUserFriendlyError(error: any): string {
  // Network errors
  if (
    error instanceof NetworkError ||
    error.name === "TypeError" ||
    error.message?.includes("network") ||
    error.message?.includes("fetch")
  ) {
    return "Netzwerkfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.";
  }

  // Rate limiting
  if (error instanceof RateLimitError) {
    return `Zu viele Anfragen. Bitte warte ${error.retryAfter} Sekunden und versuche es erneut.`;
  }

  // Authentication errors
  if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
    return "Authentifizierungsfehler. Bitte kontaktiere den Support.";
  }

  // Server errors
  if (error instanceof APIError && error.status >= 500) {
    return "Der KI-Service ist vorübergehend nicht verfügbar. Bitte versuche es in ein paar Minuten erneut.";
  }

  // Tool-specific errors
  if (error.message?.includes("geocoding") || error.message?.includes("location")) {
    return "Der Ort konnte nicht gefunden werden. Bitte gib eine genauere Adresse an.";
  }

  if (
    error.message?.includes("Supabase") ||
    error.message?.includes("database") ||
    error.message?.includes("storage")
  ) {
    return "Fehler beim Speichern. Bitte versuche es erneut.";
  }

  if (error.message?.includes("image") || error.message?.includes("flyer")) {
    return "Fehler beim Verarbeiten des Bildes. Bitte versuche es mit einem anderen Bild.";
  }

  // Default
  return "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.";
}

/**
 * Validate conversation history
 */
export function validateConversationHistory(
  messages: Array<{ role: string; content: any }>
): boolean {
  if (messages.length === 0) {
    return true;
  }

  // First message must be from user
  if (messages[0].role !== "user") {
    console.error("Invalid conversation: must start with user message");
    return false;
  }

  // Check alternating roles
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    if (prev.role === curr.role) {
      console.error("Invalid conversation: consecutive same-role messages");
      return false;
    }
  }

  return true;
}

/**
 * Truncate conversation history to keep only recent messages
 */
export function truncateConversationHistory<T extends { role: string; content: any }>(
  messages: T[],
  maxTurns = 10
): T[] {
  if (messages.length <= maxTurns * 2) {
    return messages;
  }

  // Keep the first user message (often contains important context)
  const firstMessage = messages[0].role === "user" ? [messages[0]] : [];

  // Keep the last N turns (user + assistant pairs)
  const recentMessages = messages.slice(-(maxTurns * 2));

  // Ensure we start with a user message
  const startIndex = recentMessages[0].role === "user" ? 0 : 1;

  return [...firstMessage, ...recentMessages.slice(startIndex)];
}
