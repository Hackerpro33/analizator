import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.jsx'

vi.mock('@/pages/index.jsx', () => ({
  default: () => <div data-testid="pages-root">Pages placeholder</div>,
}))

vi.mock('@/components/ui/toaster', () => ({
  Toaster: () => <div role="status">Notifications ready</div>,
}))

describe('App', () => {
  it('renders shell layout with pages and toaster', () => {
    render(<App />)

    expect(screen.getByTestId('pages-root')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
