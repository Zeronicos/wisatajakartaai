import AuthFormCard from "@/components/auth/AuthFormCard"

export default function InternalAdminGatePage() {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <AuthFormCard
          role="admin"
          title="Masuk sebagai Admin"
          description="Masuk dengan akun admin yang sudah ada."
          redirectPath="/admin"
        />
      </div>
    </main>
  )
}
