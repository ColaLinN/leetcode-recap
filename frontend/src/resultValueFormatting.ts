export const RESULT_PREVIEW_CHARACTERS = 700;

export type ResultValuePresentation = {
  text: string;
  preview: string;
  copyText: string | null;
  truncated: boolean;
  summary: string;
};

// Add reading space only outside JSON strings; string content stays byte-for-byte intact.
function spaceJson(json: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const character of json) {
    result += character;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    } else if (character === "," || character === ":") {
      result += " ";
    }
  }
  return result;
}

export function presentResultValue(
  value: unknown,
  previewCharacters = RESULT_PREVIEW_CHARACTERS,
): ResultValuePresentation {
  const copyText = JSON.stringify(value) ?? null;
  const text = copyText === null ? "—" : spaceJson(copyText);
  const limit = Math.max(1, Math.floor(previewCharacters));
  const truncated = text.length > limit;
  // Do not split a supplementary Unicode character at the preview boundary.
  let end = Math.min(limit, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
  const summary = Array.isArray(value)
    ? `${value.length} 项`
    : value !== null && typeof value === "object"
      ? `${Object.keys(value).length} 个字段`
      : typeof value === "string"
        ? `${value.length} 字符`
        : "";
  return {
    text,
    preview: truncated ? `${text.slice(0, end)}\n…` : text,
    copyText,
    truncated,
    summary,
  };
}

export async function copyResultValue(
  presentation: ResultValuePresentation,
  writeText: (text: string) => Promise<void>,
): Promise<boolean> {
  if (presentation.copyText === null) return false;
  await writeText(presentation.copyText);
  return true;
}
