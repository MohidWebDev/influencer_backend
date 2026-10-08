import { env } from '../config/env'
import type { IPhotoCredit } from '../models/Person'

// Wikimedia ka qaida: har request pe saaf User-Agent
const USER_AGENT = `${env.platformName.replace(/\s+/g, '')}Seed/1.0 (${env.clientUrl})`
const PHOTO_WIDTH = 600
const MAX_BYTES = 3 * 1024 * 1024

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
  thumbwidth?: number
  url: string
  descriptionurl: string
  extmetadata?: Record<string, { value?: string } | undefined>
}

async function getJson<T>(url: string): Promise<{ status: number; body?: T }> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
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
  return /^(cc0|cc[ -]by(-sa)?\b|public domain|pd\b|pd-|gfdl|attribution)/.test(name)
}

// Wikipedia ki lead image -> Commons se license/author -> 600px wali copy download
export async function fetchWikiPhoto(title: string): Promise<WikiPhotoResult> {
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
  const res = await fetch(imageUrl, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`${res.status} downloading image`)
  const contentType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) throw new Error(`Unexpected content type ${contentType}`)
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > MAX_BYTES) {
    return { status: 'not-free', pageUrl, reason: 'Image file too large' }
  }

  return {
    status: 'ok',
    pageUrl,
    data,
    contentType,
    width: info.thumbwidth,
    credit: {
      provider: 'Wikimedia Commons',
      author: plainText(meta.Artist?.value),
      license,
      licenseUrl: meta.LicenseUrl?.value,
      sourceUrl: info.descriptionurl,
    },
  }
}
