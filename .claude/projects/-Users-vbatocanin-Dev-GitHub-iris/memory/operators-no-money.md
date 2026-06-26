---
name: operators-no-money
description: Product rule — operator (role 'user') accounts must never see any prices/money anywhere in the UI
metadata:
  type: project
---

Operator users (`role === 'user'`, i.e. non-admin) must never see any prices or
money figures anywhere. Admin (`role === 'admin'`) sees everything.

**Why:** Shop policy — only the owner/admin handles pricing, cost, and profit.

**How to apply:** When adding any UI that shows an amount (price, cost, profit,
revenue, total, RSD), gate it behind `currentUser.role === 'admin'`. Surfaces
already covered (web): dashboard finance section (`showFinance` in
useDashboardData), work-order list price column (table render, CSV export, and
the column picker in WorkOrdersFilters), work-order detail line items/invoice/
totals **and** the workflow timeline (price/cost events filtered via
`isMoneyTimelineEvent`), catalog list + detail sale price, and the client print
sheet (`buildPrintJobLines(order, isAdmin)`). The server already strips money
from the PDF/preview HTML for non-admins (`stripWorkOrderRenderMoney`) and cost/
profit from list/detail JSON (`stripWorkOrderCost`) — note it does NOT strip
`price`/`unitPrice` from JSON, so client components must gate those in the UI.
The desktop app is admin-only (`AccessDenied` for non-admins), so operators
never reach it.
