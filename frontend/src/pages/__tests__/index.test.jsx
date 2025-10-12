import { describe, expect, it } from 'vitest'
import { getCurrentPage, PAGES } from '../pageRegistry'

describe('getCurrentPage', () => {
  it('returns dashboard for empty or root paths', () => {
    expect(getCurrentPage('/')).toBe('Dashboard')
    expect(getCurrentPage('')).toBe('Dashboard')
    expect(getCurrentPage(undefined)).toBe('Dashboard')
  })

  it('handles urls with trailing slash and query params', () => {
    expect(getCurrentPage('/Maps/')).toBe('Maps')
    expect(getCurrentPage('/Forecasting?tab=history')).toBe('Forecasting')
  })

  it('falls back to dashboard when page missing', () => {
    expect(getCurrentPage('/missing')).toBe('Dashboard')
  })

  it('is case insensitive when matching names', () => {
    const anyPage = Object.keys(PAGES)[2]
    expect(getCurrentPage(`/${anyPage.toLowerCase()}`)).toBe(anyPage)
  })
})
