import { ipcMain } from 'electron'
import type { WorkOrder } from '../../../model/work-order'

// ---------------------------------------------------------------------------
// Mock data — replace with a real database query before shipping.
// Covers 6 months (Oct 2024 – Mar 2025), 4 operators, 10 clients,
// all delivery methods, and a mix of completed/in-progress and priced/null.
// ---------------------------------------------------------------------------
const MOCK_WORK_ORDERS: WorkOrder[] = [
  // October 2024
  {
    id: '1',
    clientName: 'Firma Doo',
    documentType: 'invoice',
    deliveryMethod: 'email',
    issuedBy: 'marko.petrovic',
    createdAt: '2024-10-03',
    completedAt: '2024-10-04',
    price: 12000
  },
  {
    id: '2',
    clientName: 'Kompanija AB',
    documentType: 'contract',
    deliveryMethod: 'courier',
    issuedBy: 'ana.jovic',
    createdAt: '2024-10-08',
    completedAt: '2024-10-10',
    price: 35000
  },
  {
    id: '3',
    clientName: 'Studio XYZ',
    documentType: 'receipt',
    deliveryMethod: 'pickup',
    issuedBy: 'stefan.nikolic',
    createdAt: '2024-10-15',
    completedAt: null,
    price: null
  },
  {
    id: '4',
    clientName: 'Agencija Pro',
    documentType: 'certificate',
    deliveryMethod: 'email',
    issuedBy: 'jelena.markovic',
    createdAt: '2024-10-21',
    completedAt: '2024-10-22',
    price: 8500
  },
  // November 2024
  {
    id: '5',
    clientName: 'TehnoServis',
    documentType: 'invoice',
    deliveryMethod: 'fax',
    issuedBy: 'marko.petrovic',
    createdAt: '2024-11-05',
    completedAt: '2024-11-06',
    price: 21000
  },
  {
    id: '6',
    clientName: 'Firma Doo',
    documentType: 'contract',
    deliveryMethod: 'email',
    issuedBy: 'ana.jovic',
    createdAt: '2024-11-11',
    completedAt: '2024-11-14',
    price: 48000
  },
  {
    id: '7',
    clientName: 'EkoGrad',
    documentType: 'receipt',
    deliveryMethod: 'courier',
    issuedBy: 'stefan.nikolic',
    createdAt: '2024-11-19',
    completedAt: null,
    price: 15000
  },
  {
    id: '8',
    clientName: 'MediaPlus',
    documentType: 'invoice',
    deliveryMethod: 'pickup',
    issuedBy: 'jelena.markovic',
    createdAt: '2024-11-27',
    completedAt: '2024-11-28',
    price: 9800
  },
  // December 2024
  {
    id: '9',
    clientName: 'InfraGroup',
    documentType: 'contract',
    deliveryMethod: 'email',
    issuedBy: 'marko.petrovic',
    createdAt: '2024-12-02',
    completedAt: '2024-12-05',
    price: 72000
  },
  {
    id: '10',
    clientName: 'Kompanija AB',
    documentType: 'certificate',
    deliveryMethod: 'courier',
    issuedBy: 'ana.jovic',
    createdAt: '2024-12-10',
    completedAt: '2024-12-11',
    price: 11000
  },
  {
    id: '11',
    clientName: 'SportCenter',
    documentType: 'invoice',
    deliveryMethod: 'fax',
    issuedBy: 'stefan.nikolic',
    createdAt: '2024-12-17',
    completedAt: null,
    price: null
  },
  {
    id: '12',
    clientName: 'Agencija Pro',
    documentType: 'receipt',
    deliveryMethod: 'email',
    issuedBy: 'jelena.markovic',
    createdAt: '2024-12-23',
    completedAt: '2024-12-24',
    price: 6500
  },
  // January 2025
  {
    id: '13',
    clientName: 'BioLab Doo',
    documentType: 'invoice',
    deliveryMethod: 'email',
    issuedBy: 'marko.petrovic',
    createdAt: '2025-01-07',
    completedAt: '2025-01-08',
    price: 18500
  },
  {
    id: '14',
    clientName: 'Firma Doo',
    documentType: 'contract',
    deliveryMethod: 'courier',
    issuedBy: 'ana.jovic',
    createdAt: '2025-01-13',
    completedAt: '2025-01-15',
    price: 55000
  },
  {
    id: '15',
    clientName: 'TehnoServis',
    documentType: 'certificate',
    deliveryMethod: 'pickup',
    issuedBy: 'stefan.nikolic',
    createdAt: '2025-01-20',
    completedAt: null,
    price: 7200
  },
  {
    id: '16',
    clientName: 'MediaPlus',
    documentType: 'invoice',
    deliveryMethod: 'email',
    issuedBy: 'jelena.markovic',
    createdAt: '2025-01-28',
    completedAt: '2025-01-29',
    price: 13000
  },
  // February 2025
  {
    id: '17',
    clientName: 'EkoGrad',
    documentType: 'receipt',
    deliveryMethod: 'fax',
    issuedBy: 'marko.petrovic',
    createdAt: '2025-02-04',
    completedAt: '2025-02-05',
    price: null
  },
  {
    id: '18',
    clientName: 'InfraGroup',
    documentType: 'invoice',
    deliveryMethod: 'email',
    issuedBy: 'ana.jovic',
    createdAt: '2025-02-10',
    completedAt: '2025-02-12',
    price: 29000
  },
  {
    id: '19',
    clientName: 'Kompanija AB',
    documentType: 'contract',
    deliveryMethod: 'courier',
    issuedBy: 'stefan.nikolic',
    createdAt: '2025-02-18',
    completedAt: null,
    price: 41000
  },
  {
    id: '20',
    clientName: 'SportCenter',
    documentType: 'certificate',
    deliveryMethod: 'pickup',
    issuedBy: 'jelena.markovic',
    createdAt: '2025-02-24',
    completedAt: '2025-02-25',
    price: 5500
  },
  // March 2025
  {
    id: '21',
    clientName: 'BioLab Doo',
    documentType: 'invoice',
    deliveryMethod: 'email',
    issuedBy: 'marko.petrovic',
    createdAt: '2025-03-03',
    completedAt: '2025-03-04',
    price: 22000
  },
  {
    id: '22',
    clientName: 'Agencija Pro',
    documentType: 'receipt',
    deliveryMethod: 'fax',
    issuedBy: 'ana.jovic',
    createdAt: '2025-03-10',
    completedAt: null,
    price: 3800
  },
  {
    id: '23',
    clientName: 'Firma Doo',
    documentType: 'contract',
    deliveryMethod: 'email',
    issuedBy: 'stefan.nikolic',
    createdAt: '2025-03-17',
    completedAt: '2025-03-19',
    price: 67000
  },
  {
    id: '24',
    clientName: 'Studio XYZ',
    documentType: 'certificate',
    deliveryMethod: 'courier',
    issuedBy: 'jelena.markovic',
    createdAt: '2025-03-24',
    completedAt: '2025-03-25',
    price: 9200
  },
  {
    id: '25',
    clientName: 'TehnoServis',
    documentType: 'invoice',
    deliveryMethod: 'pickup',
    issuedBy: 'marko.petrovic',
    createdAt: '2025-03-31',
    completedAt: null,
    price: null
  }
]

/**
 * Registers all IPC handlers for the WorkOrder feature.
 *
 * Channel: 'workorders:getAll'
 *   Returns:  WorkOrder[]
 *
 * Channel: 'workorders:getOperators'
 *   Returns:  string[]  (sorted unique operator usernames)
 *
 * Call this once from main/index.ts inside app.whenReady().
 */
export function registerWorkOrderHandlers(): void {
  ipcMain.handle('workorders:getAll', async (): Promise<WorkOrder[]> => {
    return MOCK_WORK_ORDERS
  })

  ipcMain.handle('workorders:getOperators', async (): Promise<string[]> => {
    const operators = [...new Set(MOCK_WORK_ORDERS.map((o) => o.issuedBy))]
    return operators.sort()
  })
}
