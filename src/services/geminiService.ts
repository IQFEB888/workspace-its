const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
];

/**
 * Maps deprecated or internal alias model IDs (e.g. gemini-1.5-flash, gemini-2.0-flash, gemini-3.8-flash)
 * to valid public v1beta Gemini models so requests never fail with 404 Model Not Found / Deprecated.
 */
export function normalizeGeminiModelName(rawModel?: string | null): string {
  const m = (rawModel || '').trim().toLowerCase();
  if (!m) return 'gemini-2.5-flash';

  // Never allow deprecated 1.0 / 1.5 / 2.0 models
  if (
    m.includes('1.5') ||
    m.includes('2.0') ||
    m === 'gemini-pro' ||
    m === 'gemini-flash' ||
    m === 'gemini-3.8-flash' ||
    m === 'gemini-3.6-flash'
  ) {
    return 'gemini-2.5-flash';
  }

  if (m === 'gemini-3.8-pro') {
    return 'gemini-2.5-pro';
  }

  return rawModel!.trim();
}

/**
 * Calls the Gemini API with automatic API key rotation and model fallback.
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
