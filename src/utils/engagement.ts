// Card ke liye ek engagement: accounts ka followers ke hisaab se average (bara account zyada wazan).
// Kisi account ka engagement na ho to null
export function averageEngagement(accounts: { followers?: number; engagementRate?: number }[] = []) {
  const known = accounts.filter((a) => typeof a.engagementRate === 'number')
  if (!known.length) return null
  const weight = known.reduce((sum, a) => sum + (a.followers ?? 0), 0)
  const rate = weight
    ? known.reduce((sum, a) => sum + a.engagementRate! * (a.followers ?? 0), 0) / weight
    : known.reduce((sum, a) => sum + a.engagementRate!, 0) / known.length
  return Math.round(rate * 10) / 10
}
