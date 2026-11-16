import { describe, expect, it } from 'vitest'
import { caseFileFolder, fileNameOf, fileSize, isCaseFilePath, safeFileName } from './case-files'

const CASE = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-2222-3333-4444-555555555555'
const UP = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('case files', () => {
  it('accepts only files stored under this case, as the uploader names them', () => {
    expect(isCaseFilePath(`${caseFileFolder(CASE)}/${UP}-mylo_dataset.zip`, CASE)).toBe(true)
    expect(isCaseFilePath(`${caseFileFolder(OTHER)}/${UP}-mylo_dataset.zip`, CASE)).toBe(false)
    expect(isCaseFilePath(`cases/${CASE}/mylo_dataset.zip`, CASE)).toBe(false)
    expect(isCaseFilePath(`cases/${CASE}/${UP}-../../x.zip`, CASE)).toBe(false)
    expect(isCaseFilePath(`runs/${CASE}/${UP}-x.png`, CASE)).toBe(false)
  })

  it('keeps names safe and readable', () => {
    expect(safeFileName('MyLO data (v2).zip')).toBe('MyLO_data_v2_.zip')
    expect(safeFileName('???')).toBe('_')
    expect(fileNameOf(`cases/${CASE}/${UP}-MyLO_data.zip`)).toBe('MyLO_data.zip')
  })

  it('says how big a file is', () => {
    expect(fileSize(512)).toBe('512 B')
    expect(fileSize(2048)).toBe('2 KB')
    expect(fileSize(3.5 * 1024 * 1024)).toBe('3.5 MB')
    expect(fileSize(42 * 1024 * 1024)).toBe('42 MB')
  })
})
