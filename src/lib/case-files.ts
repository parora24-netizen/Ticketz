/**
 * Files kept on a test case: datasets and inputs a test needs (a zip, CSV, spreadsheet, JSON), or
 * screenshots. They live in the private case-files bucket under cases/<case id>/, and each one has a
 * row in case_files saying who added it and when. Pure, so the page, the API and tests share it.
 */

export const CASE_FILES_BUCKET = 'case-files'
export const MAX_CASE_FILE_BYTES = 50 * 1024 * 1024
export const MAX_CASE_FILES_AT_ONCE = 10

/** What the file picker offers. The bucket checks the type again. */
export const CASE_FILE_ACCEPT = '.zip,.gz,.7z,.csv,.tsv,.xlsx,.xls,.json,.txt,.xml,.sql,.parquet,.pdf,.png,.jpg,.jpeg,.gif,.webp'

/** A file's folder for its case, and a stored name that cannot clash with another upload. */
export const caseFileFolder = (caseId: string) => `cases/${caseId}`
export const safeFileName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-120) || 'file'

const PATH = /^cases\/([0-9a-f-]{36})\/[0-9a-f-]{36}-[\w.-]{1,120}$/

/** True when `path` is a stored file of this case, as the uploader made it. */
export function isCaseFilePath(path: string, caseId: string) {
  const m = PATH.exec(path)
  return !!m && m[1] === caseId
}

/** The name the person gave the file, without the stored prefix. */
export const fileNameOf = (path: string) => path.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '')

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
