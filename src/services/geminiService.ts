const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const CHAT_MODEL_OPTIONS = [
  'gemini-3.8-flash',
  'gemini-3.8-pro',
  'gemini-3.6-flash',
] as const;

export const STUDY_GENERATION_MODEL = 'gemini-3.6-flash';

export const MODEL_FALLBACKS = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.8-pro',
];

/**
 * Preserves the exact model selected by the user ('gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.6-flash').
 * Only migrates legacy deprecated 1.5 / 2.0 / 2.5 values to 'gemini-3.6-flash'.
 */
export function normalizeGeminiModelName(rawModel?: string | null): string {
  const trimmed = (rawModel || '').trim();
  const m = trimmed.toLowerCase();
  if (!m) return STUDY_GENERATION_MODEL;

  if (
    m.includes('1.5') ||
    m.includes('2.0') ||
    m.includes('2.5') ||
    m === 'gemini-pro' ||
    m === 'gemini-flash'
  ) {
    return STUDY_GENERATION_MODEL;
  }

  return trimmed;
}

/**
 * Calls the Gemini API using the exact model requested first, with automatic API key rotation
 * and modern 3.x fallback models (never silently downgrading to deprecated 2.5 models).
 * Supports both call signatures:
 *   1) callGeminiWithRotation(apiKeys, model, systemPrompt: string, contents: any[])
 *   2) callGeminiWithRotation(apiKeys, model, contents: any[], systemPrompt?: string)
 */
export async function callGeminiWithRotation(
  apiKeys: string[],
  selectedModel: string,
  arg3: any,
  arg4?: any
): Promise<string> {
  const validKeys = (apiKeys || []).map(k => k.trim()).filter(Boolean);
  if (validKeys.length === 0) {
    throw new Error('Nessuna API Key Gemini configurata nelle Impostazioni.');
  }

  let systemInstructionText = '';
  let contentsPayload: any[] = [];

  if (typeof arg3 === 'string') {
    systemInstructionText = arg3;
    contentsPayload = Array.isArray(arg4) ? arg4 : [{ role: 'user', parts: [{ text: String(arg4 || '') }] }];
  } else if (Array.isArray(arg3)) {
    contentsPayload = arg3;
    if (typeof arg4 === 'string') {
      systemInstructionText = arg4;
    }
  } else {
    contentsPayload = [{ role: 'user', parts: [{ text: String(arg3 || '') }] }];
  }

  const normalizedPrimary = normalizeGeminiModelName(selectedModel);
  const candidateModels = Array.from(new Set([normalizedPrimary, ...MODEL_FALLBACKS]));
  let lastError: Error | null = null;

  for (const model of candidateModels) {
    for (const key of validKeys) {
      try {
        const body: Record<string, any> = {
          contents: contentsPayload,
        };
        if (systemInstructionText.trim()) {
          body.systemInstruction = {
            parts: [{ text: systemInstructionText }],
          };
        }

        const response = await fetch(
          `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = errData?.error?.message || `HTTP ${response.status}`;
          lastError = new Error(msg);
          continue;
        }

        const data = await response.json();
        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text || '')
            .join('') || '';

        if (text) {
          return text;
        }
        lastError = new Error('Risposta vuota dal modello Gemini.');
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastError || new Error('Impossibile contattare Gemini API con le chiavi fornite.');
}
