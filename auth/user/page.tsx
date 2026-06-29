import AuthFormCard from "@/components/auth/AuthFormCard"

export default function UserAuthPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <AuthFormCard
          role="user"
          title="Masuk Sebagai User"
          description="Masuk atau daftar dengan email, Google, atau password."
          redirectPath="/"
          forgotPasswordPath="/auth/user/forgot-password"
          enableGoogleLogin
        />
      </div>
    </main>
  )
}
