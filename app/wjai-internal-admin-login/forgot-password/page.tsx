import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm"

export default function AdminForgotPasswordPage() {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <ForgotPasswordForm role="admin" loginPath=".." />
    </main>
  )
}
