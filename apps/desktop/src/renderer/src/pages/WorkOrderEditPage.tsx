import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { WorkOrderForm } from '@/components/WorkOrders/WorkOrderForm'
import type { WorkOrder } from '@/types/work-order'
import type { WorkOrderFormValues } from '@/lib/work-orders/validation'

function getLocalIsoDate(date = new Date()): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10)
}

function WorkOrderEditPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    window.api
      .getWorkOrderById(id)
      .then((data) => {
        if (!data) {
          setError('Radni nalog nije pronađen')
        } else {
          setOrder(data)
        }
      })
      .catch(() => {
        setError('Greška pri učitavanju radnog naloga')
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmit = useCallback(
    async (values: WorkOrderFormValues) => {
      if (!id || !order) return

      await window.api.updateWorkOrder(id, {
        clientName: values.clientName,
        contactPerson: values.contactPerson,
        jobDescription: values.jobDescription,
        jobDetails: values.jobDetails,
        billingDocumentType: values.billingDocumentType,
        billingDocumentNumber: values.billingDocumentNumber,
        shipping: values.shipping,
        executedBy: values.executedBy,
        issueDate: values.issueDate,
        dueDate: values.dueDate,
        price: values.price,
        note: values.note,
      })
      toast.success(`Radni nalog ${order.orderNumber} je ažuriran`)
      navigate('/work-orders')
    },
    [id, order, navigate]
  )

  const handleToggleStatus = useCallback(async () => {
    if (!id || !order) return
    const isCompleting = order.status === 'active'
    const newStatus = isCompleting ? 'completed' : 'active'
    const now = getLocalIsoDate()

    const updated = await window.api.updateWorkOrder(id, {
      status: newStatus,
      isCompleted: isCompleting,
      completionDate: isCompleting ? now : null,
    })
    if (updated) {
      setOrder(updated)
      toast.success(
        isCompleting
          ? `Nalog ${order.orderNumber} označen kao završen`
          : `Nalog ${order.orderNumber} označen kao aktivan`
      )
    }
  }, [id, order])

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
          <h1 className="text-base font-semibold">
            {order ? `Izmena naloga ${order.orderNumber}` : 'Izmena naloga'}
          </h1>
          {order &&
            (order.status === 'active' || order.status === 'completed') && (
              <Button
                variant={
                  order.status === 'completed' ? 'outline' : 'secondary'
                }
                size="sm"
                onClick={handleToggleStatus}
              >
                {order.status === 'active'
                  ? 'Označi kao završeno'
                  : 'Označi kao aktivno'}
              </Button>
            )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Učitavanje naloga...</span>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-none border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!loading && !error && order && (
          <WorkOrderForm
            initialData={order}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        )}
      </div>
    </AppShell>
  )
}

export default WorkOrderEditPage
