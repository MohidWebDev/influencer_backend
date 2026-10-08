import sharp from 'sharp'
import { env } from '../config/env'
import type { IPhotoCredit } from '../models/Person'

// Wikimedia ka qaida: har request pe saaf User-Agent
const USER_AGENT = `${env.platformName.replace(/\s+/g, '')}Seed/1.0 (${env.clientUrl})`
const PHOTO_WIDTH = 600
// Asal file itni bari ho sakti hai; hum khud 600px WebP banate hain
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
const RETRIES = 4
const TIMEOUT_MS = 20_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Network ka waqti masla ya Wikimedia ki "ahista chalo" (429 / 5xx): ruk kar dobara.
// 404 jaisa pakka jawab foran wapas
async function fetchWithRetry(url: string, accept: string) {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status !== 429 && res.status < 500) return res
      lastError = new Error(`${res.status} from ${new URL(url).host}`)
      const retryAfter = Number(res.headers.get('retry-after'))
      if (retryAfter > 0) await sleep(Math.min(retryAfter, 30) * 1000)
    } catch (error) {
      lastError = error
    }
    if (attempt < RETRIES) await sleep(1000 * 2 ** (attempt - 1))
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed')
}

export type WikiPhotoResult =
  | {
      status: 'ok'
      pageUrl: string
      data: Buffer
      contentType: string
      width?: number
      credit: IPhotoCredit
    }
  | {
      // no-article: Wikipedia pe page nahi; no-image: page pe lead image nahi;
      // not-free: image Commons pe nahi (aksar non-free) ya license free nahi
      status: 'no-article' | 'no-image' | 'not-free'
      pageUrl: string
      reason: string
    }

interface Summary {
  originalimage?: { source: string }
  content_urls?: { desktop?: { page?: string } }
}

interface CommonsImageInfo {
  thumburl?: string
  url: string
  descriptionurl: string
  extmetadata?: Record<string, { value?: string } | undefined>
}

async function getJson<T>(url: string): Promise<{ status: number; body?: T }> {
  const res = await fetchWithRetry(url, 'application/json')
  if (res.status === 404) return { status: 404 }
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  return { status: res.status, body: (await res.json()) as T }
}

// "<a href=...>Jane Doe</a>" -> "Jane Doe"
function plainText(html?: string) {
  if (!html) return undefined
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 300) : undefined
}

// Sirf free licenses: CC0, CC BY, CC BY-SA, public domain, GFDL. NC / ND nahi
export function isFreeLicense(shortName: string, nonFree?: string) {
  if (nonFree === 'true' || nonFree === '1') return false
  const name = shortName.trim().toLowerCase()
  if (/\b(nc|nd)\b/.test(name)) return false
  // GODL-India: Bharat sarkar ka open license, Commons pe free maana jata hai
  return /^(cc0|cc[ -]by(-sa)?\b|public domain|pd\b|pd-|gfdl|godl|attribution)/.test(name)
}

// Kai titles ho sakte hain (jaise "Ducky_Bhai" na mile to asal naam): pehla mojood article
export async function fetchWikiPhoto(titles: string[]): Promise<WikiPhotoResult> {
  let result: WikiPhotoResult | undefined
  for (const title of titles) {
    result = await fetchWikiPhotoForTitle(title)
    if (result.status !== 'no-article') return result
  }
  return result!
}

// Wikipedia ki lead image -> Commons se license/author -> download -> 600px WebP
async function fetchWikiPhotoForTitle(title: string): Promise<WikiPhotoResult> {
  const fallbackPage = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  const summary = await getJson<Summary>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  )
  if (summary.status === 404 || !summary.body) {
    return { status: 'no-article', pageUrl: fallbackPage, reason: 'No English Wikipedia article' }
  }
  const pageUrl = summary.body.content_urls?.desktop?.page ?? fallbackPage
  const source = summary.body.originalimage?.source
  if (!source) return { status: 'no-image', pageUrl, reason: 'Article has no lead image' }

  // upload.wikimedia.org/wikipedia/commons/... = Commons (free). /wikipedia/en/... = local, aksar non-free
  const path = new URL(source).pathname
  if (!path.startsWith('/wikipedia/commons/')) {
    return { status: 'not-free', pageUrl, reason: 'Lead image is not on Wikimedia Commons' }
  }
  const fileName = decodeURIComponent(path.split('/').pop() ?? '')

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: String(PHOTO_WIDTH),
    titles: `File:${fileName}`,
  })
  const commons = await getJson<{ query?: { pages?: { imageinfo?: CommonsImageInfo[] }[] } }>(
    `https://commons.wikimedia.org/w/api.php?${params}`,
  )
  const info = commons.body?.query?.pages?.[0]?.imageinfo?.[0]
  if (!info) return { status: 'not-free', pageUrl, reason: 'File not found on Commons' }

  const meta = info.extmetadata ?? {}
  const license = plainText(meta.LicenseShortName?.value) ?? ''
  if (!license || !isFreeLicense(license, meta.NonFree?.value)) {
    return { status: 'not-free', pageUrl, reason: `License not free: ${license || 'unknown'}` }
  }

  const imageUrl = info.thumburl ?? info.url
  const res = await fetchWithRetry(imageUrl, 'image/*')
  if (!res.ok) throw new Error(`${res.status} downloading image`)
  const original = Buffer.from(await res.arrayBuffer())
  if (original.length > MAX_DOWNLOAD_BYTES) throw new Error('Image file too large')

  // Hamesha 600px chaurai (chhoti ho to bari nahi karte), WebP: chhoti file, achi quality
  const { data, info: out } = await sharp(original)
    .rotate()
    .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  const contentType = 'image/webp'

  return {
    status: 'ok',
    pageUrl,
    data,
    contentType,
    width: out.width,
    credit: {
      provider: 'Wikimedia Commons',
      author: plainText(meta.Artist?.value),
      license,
      licenseUrl: meta.LicenseUrl?.value,
      sourceUrl: info.descriptionurl,
    },
  }
}
