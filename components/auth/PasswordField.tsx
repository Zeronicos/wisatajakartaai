'use client'

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

interface PasswordFieldProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
  minLength?: number
  belowField?: React.ReactNode
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required = true,
  minLength,
  belowField,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-input bg-background py-2 pl-3 pr-10 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {belowField}
    </div>
  )
}
