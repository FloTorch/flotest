import { encode } from "gpt-tokenizer";

export function countTokens(text: string): number {
  return encode(text).length;
}
