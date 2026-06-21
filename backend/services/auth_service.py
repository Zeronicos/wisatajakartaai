"""Layanan reset password (email) dan verifikasi Google OAuth ID token."""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def reset_token_expiry_hours() -> int:
    raw = os.getenv("PASSWORD_RESET_EXPIRY_HOURS", "1").strip()
    try:
        value = int(raw)
    except ValueError:
        value = 1
    return max(1, min(value, 24))


def build_reset_password_url(raw_token: str, role: str = "admin") -> str:
    base = (os.getenv("APP_PUBLIC_BASE_URL") or os.getenv("FRONTEND_PUBLIC_URL") or "http://localhost:3000").rstrip("/")
    normalized_role = (role or "admin").strip().lower()
    if normalized_role == "user":
        path = "/auth/user/reset-password"
    else:
        gate = (os.getenv("ADMIN_LOGIN_GATE_PATH") or os.getenv("WJAI_ADMIN_SECRET_PATH") or "/WJAI_SUPER_SECRET_GATE").strip()
        if not gate.startswith("/"):
            gate = f"/{gate}"
        if len(gate) > 1 and gate.endswith("/"):
            gate = gate[:-1]
        path = f"{gate}/reset-password"
    return f"{base}{path}?token={raw_token}"


def send_password_reset_email(*, recipient: str, reset_url: str, user_name: str, role: str = "admin") -> bool:
    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    smtp_port_raw = (os.getenv("SMTP_PORT") or "587").strip()
    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_password = (os.getenv("SMTP_PASSWORD") or "").strip()
    smtp_from = (os.getenv("SMTP_FROM") or smtp_user or "no-reply@wisatajakartaai.com").strip()

    role_label = "User" if (role or "").strip().lower() == "user" else "Admin"
    subject = f"Reset Password {role_label} — Wisata Jakarta AI"
    body = (
        f"Halo {user_name},\n\n"
        f"Kami menerima permintaan reset password untuk akun {role_label.lower()} Wisata Jakarta AI.\n"
        f"Silakan buka tautan berikut (berlaku {reset_token_expiry_hours()} jam):\n\n"
        f"{reset_url}\n\n"
        "Jika Anda tidak meminta reset password, abaikan email ini.\n\n"
        "— Wisata Jakarta AI"
    )

    if not smtp_host:
        logger.warning(
            "SMTP_HOST belum di-set. Reset password %s untuk %s: %s",
            role_label.lower(),
            recipient,
            reset_url,
        )
        return _env_bool("AUTH_DEBUG_RESET", False)

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 587

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = recipient
    message.set_content(body)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
            smtp.starttls()
            if smtp_user:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(message)
        return True
    except Exception as exc:
        logger.exception("Gagal mengirim email reset password ke %s: %s", recipient, exc)
        return False


def verify_google_id_token(id_token: str) -> dict:
    client_id = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    if not client_id:
        raise ValueError("GOOGLE_OAUTH_CLIENT_ID belum dikonfigurasi di backend.")

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    payload = google_id_token.verify_oauth2_token(id_token, google_requests.Request(), client_id)
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Token Google tidak memuat email.")
    if payload.get("email_verified") is False:
        raise ValueError("Email Google belum terverifikasi.")

    return {
        "email": email,
        "name": str(payload.get("name") or email.split("@")[0]).strip(),
        "google_sub": str(payload.get("sub") or "").strip(),
        "picture": payload.get("picture"),
    }


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
