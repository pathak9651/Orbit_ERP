import { useState } from 'react'

/** Renders a password field with an accessible control to reveal or hide its value. */
export default function PasswordInput({ className = '', ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false)
  const inputLabel = inputProps['aria-label'] || inputProps.name || 'password'

  return (
    <span className={`password-input ${className}`.trim()}>
      <input {...inputProps} type={isVisible ? 'text' : 'password'} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={`${isVisible ? 'Hide' : 'Show'} ${inputLabel}`}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((visible) => !visible)}
      >
        {isVisible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 5.2A11.5 11.5 0 0 1 12 5c5.2 0 9 4.7 10 7-.4.9-1.3 2.2-2.6 3.4M6.2 6.2C3.9 7.7 2.5 9.8 2 12c1 2.3 4.8 7 10 7 1.1 0 2.1-.2 3-.6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  )
}
