interface AuthErrorAlertProps {
  message: string
}

export default function AuthErrorAlert({ message }: AuthErrorAlertProps) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  )
}
