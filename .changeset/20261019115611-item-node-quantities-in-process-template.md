---
bump: minor
---
Item-node quantities in process templates are now per unit of the order: reservations, automatic stock posting and the simulator multiply them by the work order quantity (behaviour change for processes attached from now on). Existing per-order process copies are flagged quantitiesPerOrder and keep their absolute amounts until a template is re-attached.
