/** Bebaskan port frontend/backend dev (prioritas PowerShell Windows). */
const { execSync } = require("child_process")

const ports = [3000, 8000]

try {
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(${ports.join(
        ",",
      )}); foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
      { stdio: "ignore", timeout: 20000 },
    )
  } else {
    execSync(`sh -c '${ports.map((p) => `lsof -ti:${p} | xargs kill -9 2>/dev/null;`).join(" ")}true'`, {
      stdio: "ignore",
      timeout: 20000,
    })
  }
} catch {
  /* kosong atau ditolak */
}
