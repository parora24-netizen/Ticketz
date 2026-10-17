'use client'

import { useFormStatus } from 'react-dom'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean
  small?: boolean
  /** Shown while the form is submitting. */
  pendingText?: string
}

/** A form's submit button that shows it is working and can't be pressed twice. */
export function SubmitButton({ primary, small, pendingText = 'Saving…', className = '', children, disabled, ...rest }: Props) {
  const { pending, data } = useFormStatus()
  // With several submit buttons in one form (Pass / Fail / Blocked) only the pressed one spins.
  const mine = pending && (!rest.name || data?.get(rest.name) === rest.value)
  return (
    <button
      type="submit"
      {...rest}
      disabled={disabled || pending}
      aria-busy={mine || undefined}
      className={`btn ${primary ? 'btn-primary' : ''} ${small ? 'btn-sm' : ''} ${className}`}
    >
      {mine && (
        <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
      )}
      {mine ? pendingText : children}
    </button>
  )
}
