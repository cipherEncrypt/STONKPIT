/** Strip angle brackets from strings shown in the UI (React text nodes). */
export function sanitizeDisplayText(raw: string, maxLen = 64): string {
  return raw.trim().slice(0, maxLen).replace(/[<>]/g, "");
}
