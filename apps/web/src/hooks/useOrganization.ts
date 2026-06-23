import { useContext } from 'react'
import { OrganizationContext } from '@/contexts/OrganizationContext'

/** Reads the shop-wide organization settings (firm name) from context. */
export function useOrganization() {
  return useContext(OrganizationContext)
}
