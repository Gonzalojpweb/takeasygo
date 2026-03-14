/**
 * Free translation helper using MyMemory API.
 * No API key required. Free tier: ~5000 chars/day.
 * Designed for occasional use (admin adding menu items).
 */
export async function translateToEnglish(text: string): Promise<string> {
  if (!text?.trim()) return text ?? ''
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=es|en`,
      { signal: AbortSignal.timeout(6000) }
    )
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText
    }
  } catch {
    // Translation failed — return original text as fallback
  }
  return text
}
