import { useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { WorkOrderForm } from '@/components/WorkOrders/WorkOrderForm'
import { useAuth } from '@/hooks/useAuth'
import type { WorkOrderFormValues } from '@/lib/work-orders/validation'
import type { WorkOrder } from '@/types/work-order'

function getDuplicateInitialValues(
  source: WorkOrder | null
): WorkOrderFormValues | undefined {
  if (!source) return undefined

  return {
    clientName: source.clientName,
    contactPerson: source.contactPerson,
    jobDescription: source.jobDescription,
    jobDetails: source.jobDetails,
    billingDocumentType: source.billingDocumentType,
    billingDocumentNumber: source.billingDocumentNumber,
    shipping: source.shipping,
    price: source.price,
    note: source.note,
    issueDate: source.issueDate,
    dueDate: source.dueDate,
    executedBy: null,
  }
}

function WorkOrderCreatePage(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()

  // Duplicate pre-fill: data passed via router state
  const duplicateSource = (location.state as { duplicateFrom?: WorkOrder })
    ?.duplicateFrom ?? null
  const duplicateInitialValues = getDuplicateInitialValues(duplicateSource)

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      const result = await window.api.createWorkOrder({
        clientName: values.clientName,
        contactPerson: values.contactPerson,
        jobDescription: values.jobDescription,
        jobDetails: values.jobDetails,
        billingDocumentType: values.billingDocumentType,
        billingDocumentNumber: values.billingDocumentNumber,
        shipping: values.shipping,
        issuedBy: currentUser.username,
        issueDate: values.issueDate,
        dueDate: values.dueDate,
        price: values.price,
        note: values.note,
      })
      toast.success(`Radni nalog ${result.orderNumber} je kreiran`)
      navigate('/work-orders')
    },
    [currentUser.username, navigate]
  )

  const handleCancel = useCallback(() => {
    navigate('/work-orders')
  }, [navigate])

  return (
    <AppShell>
      <div className="space-y-6 p-8">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/work-orders')}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Nazad na naloge
          </Button>
          <h1 className="text-base font-semibold">Novi radni nalog</h1>
        </div>

        <WorkOrderForm
          initialValues={duplicateInitialValues}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </AppShell>
  )
}

export default WorkOrderCreatePage
