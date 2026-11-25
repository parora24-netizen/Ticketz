import { describe, expect, it } from 'vitest'
import { CaseCreate, CaseText, hasAutomationKeys, isTextChange } from './case-text'

describe('case text through the API', () => {
  it('tells a text change from an automation one', () => {
    expect(isTextChange({ expected: 'Saved' })).toBe(true)
    expect(isTextChange({ retired: true, retired_reason: 'Gone' })).toBe(true)
    expect(isTextChange({ automation_status: 'automated' })).toBe(false)
    expect(hasAutomationKeys({ title: 'x', automation_note: 'y' })).toBe(true)
  })
  it('takes the text fields and a revision, and nothing unknown', () => {
    expect(CaseText.safeParse({ title: 'Verify Save', expected: 'Saved', revision: 3 }).success).toBe(true)
    expect(CaseText.safeParse({ title: 'Verify Save', zone: 'Engine' }).success).toBe(false)
    expect(CaseText.safeParse({ priority: 'Urgent' }).success).toBe(false)
  })
  it('needs a reason to retire or defer', () => {
    expect(CaseText.safeParse({ retired: true }).success).toBe(false)
    expect(CaseText.safeParse({ retired: true, retired_as: 'deferred', retired_reason: 'Needs a licence' }).success).toBe(true)
    expect(CaseText.safeParse({ retired: false }).success).toBe(true)
  })
  it('creates a case from a page and a title, Medium unless told', () => {
    const p = CaseCreate.safeParse({ zone: 'Engine', page: 'Admin', title: 'Verify the new label' })
    expect(p.success && p.data.priority).toBe('Medium')
    expect(CaseCreate.safeParse({ zone: 'Engine', title: 'No page' }).success).toBe(false)
    expect(CaseCreate.safeParse({ zone: 'Engine', page: 'Admin', title: 'x', scenario_id: 'S12' }).success).toBe(false)
  })
})
