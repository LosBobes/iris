import { describe, expect, it } from 'vitest'
import type { ProcessGraph, ProcessNode } from '@/types/process'
import type { PlanAssignment, ProductionPlan } from '@/types/planning'
import type { StockLevel } from '@/types/stock'
import { buildMaterialNeeds, defaultMaterialNeedsEnd, effectiveBlocks, materialWeeks } from './material-needs'

// Mirrors iris-api/internal/planner/material_needs_test.go.

const input = (id: string, label: string, unit: string, catalogItemId: string, quantity: number): ProcessNode => ({
  id,
  kind: 'input',
  label,
  unit,
  x: 0,
  y: 0,
  quantity,
  ...(catalogItemId ? { catalogItemId } : {}),
})

const step = (id: string, status: ProcessNode['status'] = 'pending'): ProcessNode => ({
  id,
  kind: 'step',
  label: id,
  x: 0,
  y: 0,
  status,
})

const edge = (source: string, target: string) => ({ id: `${source}>${target}`, source, target })

const block = (order: string, stepId: string, start: string): PlanAssignment => ({
  id: `${order}-${stepId}-${start}`,
  workOrderId: order,
  orderNumber: order,
  clientName: '',
  stepNodeId: stepId,
  stepLabel: stepId,
  machineId: null,
  machineName: '',
  leadUserId: '',
  userIds: [],
  start,
  end: start,
  minutes: 0,
  part: 1,
  parts: 1,
  locked: false,
})

const plan = (date: string, assignments: PlanAssignment[], horizonEnd = date): ProductionPlan => ({
  id: `p-${date}`,
  date,
  status: 'published',
  horizonEnd,
  generatedAt: '',
  generatedBy: '',
  updatedAt: '',
  updatedBy: '',
  publishedAt: null,
  publishedBy: null,
  assignments,
  issues: [],
  lateOrders: [],
})

const level = (catalogItemId: string, name: string, unit: string, onHand: number, reserved: number): StockLevel => ({
  catalogItemId,
  code: catalogItemId,
  name,
  unit,
  isActive: true,
  onHand,
  reserved,
  available: onHand - reserved,
  minStock: null,
  low: false,
  lastMovementAt: null,
})

function scenario() {
  const weeks = materialWeeks('2026-10-19', '2026-11-01')
  if (!Array.isArray(weeks)) throw new Error(weeks)
  const o1: ProcessGraph = {
    nodes: [
      input('paper', 'Papir', 'tabak', 'cat-paper', 2),
      input('ink', 'Boja', 'kg', '', 0.1),
      input('glue', 'Lepak', 'kg', 'cat-glue', 1),
      input('old', 'Stari karton', 'kom', 'cat-gone', 0.5),
      step('print', 'in_progress'),
    ],
    edges: [edge('paper', 'print'), edge('ink', 'print'), edge('glue', 'print'), edge('old', 'print')],
  }
  const o2: ProcessGraph = { nodes: [input('paper', 'Papir', 'tabak', 'cat-paper', 5), step('cut')], edges: [edge('paper', 'cut')] }
  const o3: ProcessGraph = {
    nodes: [input('paper', 'Papir', 'tabak', 'cat-paper', 1), input('ink', ' boja ', 'KG', '', 0.02), step('print')],
    edges: [edge('paper', 'print'), edge('ink', 'print')],
  }
  const o4: ProcessGraph = {
    nodes: [
      input('paper', 'Papir', 'tabak', 'cat-paper', 7),
      input('lacquer', 'Lak', 'l', '', 3),
      input('loose', 'Višak', 'kom', '', 4),
      step('print', 'done'),
      step('varnish', 'skipped'),
    ],
    edges: [edge('paper', 'print'), edge('lacquer', 'varnish')],
  }
  const o5: ProcessGraph = { nodes: [input('paper', 'Papir', 'tabak', 'cat-paper', 3), step('print')], edges: [edge('paper', 'print')] }
  const friday = plan('2026-10-16', [
    block('o1', 'print', '2026-10-16T13:00'),
    block('o1', 'print', '2026-10-19T07:00'),
    block('o3', 'print', '2026-10-20T07:00'),
    block('o2', 'cut', '2026-10-22T07:00'),
  ])
  const tuesday = plan('2026-10-20', [
    block('o3', 'print', '2026-10-27T09:00'),
    block('o3', 'print', '2026-10-28T07:00'),
    block('o5', 'print', '2026-11-03T07:00'),
  ])
  return {
    weeks,
    plans: [tuesday, friday],
    orders: [
      { workOrderId: 'o3', graph: o3, factor: 100 },
      { workOrderId: 'o1', graph: o1, factor: 10 },
      { workOrderId: 'o2', graph: o2, factor: 1 },
      { workOrderId: 'o4', graph: o4, factor: 1 },
      { workOrderId: 'o5', graph: o5, factor: 1 },
    ],
    stock: new Map([
      ['cat-paper', level('cat-paper', 'Papir 70g B1', 'tabak', 110, 128)],
      ['cat-glue', level('cat-glue', 'Lepak', 'kg', 50, 10)],
    ]),
  }
}

describe('material needs (fixture twin)', () => {
  it('splits the window into clipped calendar weeks', () => {
    expect(materialWeeks('2026-10-21', '2026-10-27')).toEqual([
      { start: '2026-10-21', end: '2026-10-25' },
      { start: '2026-10-26', end: '2026-10-27' },
    ])
    expect(materialWeeks('2026-10-19', '2026-12-13')).toHaveLength(8)
    expect(materialWeeks('2026-10-19', '2026-12-14')).toBe('span')
    expect(materialWeeks('2026-10-20', '2026-10-19')).toBe('order')
    expect(materialWeeks('2026-13-01', '2026-10-19')).toBe('date')
  })

  it('defaults the end to the published horizon, clipped to eight weeks', () => {
    expect(defaultMaterialNeedsEnd('2026-10-21', [plan('2026-10-16', [], '2027-03-01')], 28)).toBe('2026-12-13')
    expect(defaultMaterialNeedsEnd('2026-10-21', [], 28)).toBe('2026-11-17')
    expect(defaultMaterialNeedsEnd('2026-10-19', [plan('2026-10-19', [], '2026-11-05')], 28)).toBe('2026-11-05')
  })

  it('resolves each date to its own plan or the latest earlier projection', () => {
    expect(effectiveBlocks(scenario().plans, '2026-10-19').map((entry) => entry.id)).toEqual([
      'o1-print-2026-10-19T07:00',
      'o3-print-2026-10-27T09:00',
      'o3-print-2026-10-28T07:00',
      'o5-print-2026-11-03T07:00',
    ])
  })

  it('aggregates open inputs by week, shortages first', () => {
    const needs = buildMaterialNeeds(scenario())
    expect(needs.from).toBe('2026-10-19')
    expect(needs.to).toBe('2026-11-01')
    expect(needs.items).toEqual([
      {
        catalogItemId: 'cat-paper',
        name: 'Papir 70g B1',
        unit: 'tabak',
        onHand: 110,
        reserved: 128,
        available: -18,
        weeks: [20, 100],
        cumulative: [20, 120],
        unplanned: 5,
        shortFromWeek: 1,
      },
      { catalogItemId: null, name: 'Boja', unit: 'kg', onHand: null, reserved: null, available: null, weeks: [1, 2], cumulative: [1, 3], unplanned: 0, shortFromWeek: null },
      { catalogItemId: 'cat-glue', name: 'Lepak', unit: 'kg', onHand: 50, reserved: 10, available: 40, weeks: [10, 0], cumulative: [10, 10], unplanned: 0, shortFromWeek: null },
      { catalogItemId: 'cat-gone', name: 'Stari karton', unit: 'kom', onHand: null, reserved: null, available: null, weeks: [5, 0], cumulative: [5, 5], unplanned: 0, shortFromWeek: null },
    ])
  })
})
