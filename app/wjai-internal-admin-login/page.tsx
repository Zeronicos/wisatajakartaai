import AuthFormCard from "@/components/auth/AuthFormCard"

export default function InternalAdminGatePage() {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <AuthFormCard
          role="admin"
          title="Masuk sebagai Admin"
          description="Masuk dengan email/password atau akun Google yang sudah terdaftar."
          redirectPath="/admin"
          loginOnly
          forgotPasswordPath="forgot-password"
          enableGoogleLogin
        />
      </div>
    </main>
  )
}
