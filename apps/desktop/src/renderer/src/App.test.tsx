import { render, screen } from '@testing-library/react'

import App from './App'

describe('App', () => {
  it('renders the example shadcn button', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument()
  })
})
