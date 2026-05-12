import AuthFormCard from "@/components/auth/AuthFormCard"

export default function UserAuthPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">User</p>
          <h2 className="mt-2 text-3xl font-bold text-foreground">Login User</h2>
          <p className="mt-2 text-sm text-muted-foreground">Akses pengguna.</p>
        </div>

        <AuthFormCard
          role="user"
          title="Masuk Sebagai User"
          description="Masuk atau daftar user."
          redirectPath="/"
        />
      </div>
    </main>
  )
}
