import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm"

export default function UserForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <ForgotPasswordForm role="user" loginPath="/auth/user" />
    </main>
  )
}
