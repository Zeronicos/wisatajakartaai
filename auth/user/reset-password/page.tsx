import { Suspense } from "react"
import ResetPasswordForm from "@/components/auth/ResetPasswordForm"

export default function UserResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <Suspense
        fallback={
          <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
            Memuat formulir reset...
          </div>
        }
      >
        <ResetPasswordForm role="user" loginPath="/auth/user" />
      </Suspense>
    </main>
  )
}
