"""
Sekali jalankan: buat atau reset akun admin (hash password sama seperti /auth/register di app).
Pakai dari folder backend: python scripts/bootstrap_admin.py

Opsional env: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD
"""
from __future__ import annotations

import hashlib
import os
import sys

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from database import get_connection
from routers.auth_history import ensure_auth_and_history_tables


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}:{digest.hex()}"


def main() -> None:
    email = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "admin@gmail.com").strip().lower()
    name = (os.getenv("BOOTSTRAP_ADMIN_NAME") or "Admin").strip() or "Admin"
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or "lookked"
    pwd_hash = _hash_password(password)

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            """
            INSERT INTO app_users (name, email, password_hash, role)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO UPDATE SET
              name = EXCLUDED.name,
              password_hash = EXCLUDED.password_hash,
              role = EXCLUDED.role
            """,
            (name, email, pwd_hash, "admin"),
        )
        conn.commit()
        print("[OK] Admin siap: email=%s role=admin (password dari env BOOTSTRAP_ADMIN_PASSWORD atau default skrip)." % email)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
