// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { useContext, useState } from 'react'
import { OrganizationContext } from '@/contexts/OrganizationContext'
import { sr } from '@/i18n/locales/sr'
import { SELLER_MESSAGES } from '@/lib/seller-identity'
import type { SellerIdentity } from '@/types/settings'
import { SellerIdentitySettings } from './SellerIdentitySettings'
import '@/i18n'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Harness({ initial }: { initial: SellerIdentity | null }): React.JSX.Element {
  const base = useContext(OrganizationContext)
  const [sellerIdentity, setSellerIdentity] = useState(initial)
  return (
    <OrganizationContext value={{ ...base, sellerIdentity, setSellerIdentity }}>
      <SellerIdentitySettings />
    </OrganizationContext>
  )
}

const fields = sr.settings.seller.fields

describe('SellerIdentitySettings', () => {
  it('validates like the API before saving, then saves the normalized identity', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn(async ({ sellerIdentity }: { sellerIdentity: SellerIdentity }) => ({
      sellerIdentity: { ...sellerIdentity, bankAccount: '160-0000000012345-67' },
    }))
    vi.stubGlobal('api', { updateSettings })
    render(<Harness initial={null} />)

    await user.type(screen.getByLabelText(fields.legalName), 'Primer d.o.o.')
    await user.type(screen.getByLabelText(fields.pib), '101234568')
    await user.click(screen.getByRole('button', { name: sr.common.save }))
    expect(await screen.findByText(SELLER_MESSAGES.pib)).toBeInTheDocument()
    expect(updateSettings).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(fields.pib))
    await user.type(screen.getByLabelText(fields.pib), '101234569')
    await user.type(screen.getByLabelText(fields.mb), '12345678')
    await user.type(screen.getByLabelText(fields.street), 'Bulevar 1')
    await user.type(screen.getByLabelText(fields.postalCode), '21000')
    await user.type(screen.getByLabelText(fields.city), 'Novi Sad')
    await user.type(screen.getByLabelText(fields.bankAccount), '160-12345-67')
    await user.click(screen.getByRole('button', { name: sr.common.save }))

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1))
    expect(updateSettings.mock.calls[0]![0].sellerIdentity).toMatchObject({
      legalName: 'Primer d.o.o.',
      pib: '101234569',
      countryCode: 'RS',
      vatPayer: true,
      email: null,
    })
    await waitFor(() => expect(screen.getByLabelText(fields.bankAccount)).toHaveValue('160-0000000012345-67'))
  })
})
