'use client'

import { useEffect, useRef, useState } from 'react'
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'

interface GoogleSignInButtonProps {
  onSuccess: (response: CredentialResponse) => void
  onError: () => void
  disabled?: boolean
}

/** Tombol Google login dengan tampilan tetap — jangan ganti ke widget/One Tap/personalized button. */
export default function GoogleSignInButton({ onSuccess, onError, disabled = false }: GoogleSignInButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [btnWidth, setBtnWidth] = useState(320)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const syncWidth = () => {
      setBtnWidth(Math.max(240, Math.floor(el.offsetWidth)))
    }

    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={wrapRef}
      className={`google-signin-button${disabled ? ' google-signin-button--disabled' : ''}`}
    >
      <div className="google-signin-button__visual" aria-hidden="true">
        <svg className="google-signin-button__icon" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.95-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
        <span>Masuk dengan Google</span>
      </div>

      <div className="google-signin-button__native" aria-label="Masuk dengan Google">
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          text="signin_with"
          type="standard"
          theme="outline"
          size="large"
          width={String(btnWidth)}
          useOneTap={false}
          locale="id"
        />
      </div>
    </div>
  )
}
