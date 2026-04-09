import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '@/contexts/AuthContext'
import WorkOrderCreatePage from './WorkOrderCreatePage'
import type { WorkOrder } from '@/types/work-order'

const duplicateSource: WorkOrder = {
  id: '42',
  orderNumber: 'RN-2025-0042',
  clientName: 'Demo Klijent',
  contactPerson: 'Milica',
  jobDescription: 'Štampa kataloga',
  jobDetails: {
    productCode: 'CAT-42',
    paperWeightGsm: 170,
    dimensions: 'A4',
    quantity: 500,
    finishingNote: 'Mat plastifikacija',
  },
  billingDocumentType: 'invoice',
  billingDocumentNumber: 'INV-42',
  shipping: {
    deliveryMethod: 'postExpress',
    hasPackaging: true,
    hasLabeling: false,
    isFragile: false,
    requiresSignature: true,
    hasInsurance: false,
    shippingAddress: 'Bulevar 1',
  },
  issuedBy: 'admin',
  executedBy: 'pera',
  issueDate: '2025-04-07',
  dueDate: '2025-04-14',
  isCompleted: true,
  status: 'completed',
  price: 12000,
  note: 'Hitno',
  createdAt: '2025-04-01T10:00:00Z',
  updatedAt: '2025-04-02T10:00:00Z',
  completionDate: '2025-04-05',
}

function renderPageWithDuplicateState(): void {
  render(
    <AuthContext.Provider
      value={{
        currentUser: { id: '1', username: 'admin', role: 'admin' },
      }}
    >
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/work-orders/new',
            state: { duplicateFrom: duplicateSource },
          },
        ]}
      >
        <Routes>
          <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('WorkOrderCreatePage', () => {
  it('keeps duplicate prefill in create mode', () => {
    renderPageWithDuplicateState()

    expect(screen.queryByText('Informacije o nalogu')).not.toBeInTheDocument()
    expect(screen.queryByText(duplicateSource.orderNumber)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Izvršio')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Naziv klijenta *')).toHaveValue(
      duplicateSource.clientName
    )
    expect(screen.getByLabelText('Opis *')).toHaveValue(
      duplicateSource.jobDescription
    )
    // DatePicker renders a button showing the formatted date, not an input
    expect(screen.getByText('7. april 2025.')).toBeInTheDocument()
  })
})
