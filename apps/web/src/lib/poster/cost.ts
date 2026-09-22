// Cost estimate from the OpenAI Images API usage block (gpt-image-2.5 rates,
// USD per million tokens: text in 5, image in 8, image out 30).
export interface ImageUsage {
  input_tokens?: number;
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  output_tokens?: number;
  output_tokens_details?: { image_tokens?: number; text_tokens?: number };
}

const RATE_TEXT_IN = 5;
const RATE_IMAGE_IN = 8;
const RATE_IMAGE_OUT = 30;

export function estimateCostUsd(usage: ImageUsage | null | undefined): number {
  if (!usage) return 0;
  const textIn = usage.input_tokens_details?.text_tokens ?? 0;
  const imageIn =
    usage.input_tokens_details?.image_tokens ?? Math.max(0, (usage.input_tokens ?? 0) - textIn);
  const out = usage.output_tokens ?? 0;
  const usd = (textIn * RATE_TEXT_IN + imageIn * RATE_IMAGE_IN + out * RATE_IMAGE_OUT) / 1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}
