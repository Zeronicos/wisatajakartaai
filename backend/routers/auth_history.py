import hashlib
import json
import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from database import get_connection
from services.auth_service import (
    build_reset_password_url,
    generate_reset_token,
    hash_reset_token,
    reset_token_expiry_hours,
    send_password_reset_email,
    utcnow,
    verify_google_id_token,
)

router = APIRouter()


def _normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Email tidak valid."})
    return email


def _hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}:{digest.hex()}"


def _parse_optional_iso_date(label: str, value: str | None) -> date | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"status": "error", "message": f"{label} tidak valid (pakai YYYY-MM-DD)."},
        ) from exc


def _verify_password(password: str, encoded: str) -> bool:
    try:
        salt_hex, digest_hex = encoded.split(":", 1)
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return actual == expected


def ensure_auth_and_history_tables(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS app_users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        ALTER TABLE app_users
        ADD COLUMN IF NOT EXISTS google_sub TEXT
        """
    )
    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS app_users_google_sub_key
            ON app_users(google_sub)
            WHERE google_sub IS NOT NULL
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
            ON password_reset_tokens(token_hash)
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS cluster_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            query_text TEXT NOT NULL,
            num_days INTEGER NOT NULL,
            total_pois INTEGER NOT NULL,
            k_optimal INTEGER NOT NULL,
            silhouette_score DOUBLE PRECISION NOT NULL,
            davies_bouldin_index DOUBLE PRECISION NOT NULL,
            wcss DOUBLE PRECISION NOT NULL,
            precision_score DOUBLE PRECISION NOT NULL,
            recall_score DOUBLE PRECISION NOT NULL,
            f1_score DOUBLE PRECISION NOT NULL,
            selected_destinations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS selected_destinations_json JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS hotel_name TEXT
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS hotel_lat DOUBLE PRECISION
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS hotel_lon DOUBLE PRECISION
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS top_k INTEGER
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS generation_mode TEXT
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS daily_destination_limit INTEGER
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS filtered_destinations_json JSONB NOT NULL DEFAULT '[]'::jsonb
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS selection_json JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )
    cur.execute(
        """
        ALTER TABLE cluster_history
        ADD COLUMN IF NOT EXISTS routes_json JSONB NOT NULL DEFAULT '{}'::jsonb
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_cluster_history_user_id
            ON cluster_history(user_id)
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_cluster_history_created_at
            ON cluster_history(created_at DESC)
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS itinerary_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            query_text TEXT NOT NULL,
            num_days INTEGER NOT NULL,
            total_days INTEGER NOT NULL,
            total_stops INTEGER NOT NULL,
            total_distance_km DOUBLE PRECISION NOT NULL,
            total_distance_m BIGINT NOT NULL,
            avg_distance_per_day_km DOUBLE PRECISION NOT NULL,
            avg_stops_per_day DOUBLE PRECISION NOT NULL,
            k_optimal INTEGER NOT NULL,
            silhouette_score DOUBLE PRECISION NOT NULL,
            davies_bouldin_index DOUBLE PRECISION NOT NULL,
            wcss DOUBLE PRECISION NOT NULL,
            precision_score DOUBLE PRECISION NOT NULL,
            recall_score DOUBLE PRECISION NOT NULL,
            f1_score DOUBLE PRECISION NOT NULL,
            hotel_name TEXT,
            hotel_lat DOUBLE PRECISION,
            hotel_lon DOUBLE PRECISION,
            itinerary_days_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_itinerary_history_user_id
            ON itinerary_history(user_id)
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_itinerary_history_created_at
            ON itinerary_history(created_at DESC)
        """
    )


class AuthPayload(BaseModel):
    name: str | None = None
    email: str
    password: str = Field(min_length=6, max_length=200)
    role: str


class ProfileUpdatePayload(BaseModel):
    email: str
    current_password: str = Field(min_length=1, max_length=200)
    name: str | None = None
    new_password: str | None = Field(default=None, max_length=200)


class ForgotPasswordPayload(BaseModel):
    email: str
    role: str = "admin"


class ResetPasswordPayload(BaseModel):
    token: str = Field(min_length=10, max_length=512)
    new_password: str = Field(min_length=6, max_length=200)
    role: str = "admin"


class GoogleAuthPayload(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)
    role: str = "admin"


def _serialize_auth_user(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
    }


FORGOT_PASSWORD_SUCCESS_MESSAGE = (
    "Jika email terdaftar, tautan reset telah dikirim. Periksa inbox Anda."
)


def _validate_auth_role(role: str) -> str:
    normalized = role.strip().lower()
    if normalized not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Role tidak valid."})
    return normalized


class ClusterHistoryCreatePayload(BaseModel):
    user_email: str
    query_text: str = Field(min_length=1, max_length=500)
    num_days: int = Field(ge=1, le=30)
    total_pois: int = Field(ge=0, le=2000)
    k_optimal: int = Field(ge=1, le=100)
    silhouette_score: float
    davies_bouldin_index: float
    wcss: float
    precision_score: float = Field(ge=0.0, le=1.0)
    recall_score: float = Field(ge=0.0, le=1.0)
    f1_score: float = Field(ge=0.0, le=1.0)
    selected_destinations: list[str] = Field(default_factory=list)
    hotel_name: str | None = Field(default=None, max_length=300)
    hotel_lat: float | None = None
    hotel_lon: float | None = None
    top_k: int | None = Field(default=None, ge=1, le=500)
    generation_mode: str | None = Field(default=None, max_length=20)
    daily_destination_limit: int | None = Field(default=None, ge=1, le=20)
    filtered_destinations: list[dict] = Field(default_factory=list)
    analysis: dict = Field(default_factory=dict)
    selection: dict = Field(default_factory=dict)
    routes: dict = Field(default_factory=dict)


class ClusterHistoryAdminUpdatePayload(BaseModel):
    query_text: str | None = Field(default=None, min_length=1, max_length=500)
    num_days: int | None = Field(default=None, ge=1, le=30)
    total_pois: int | None = Field(default=None, ge=0, le=2000)
    k_optimal: int | None = Field(default=None, ge=1, le=100)
    silhouette_score: float | None = None
    davies_bouldin_index: float | None = None
    wcss: float | None = None
    precision_score: float | None = Field(default=None, ge=0.0, le=1.0)
    recall_score: float | None = Field(default=None, ge=0.0, le=1.0)
    f1_score: float | None = Field(default=None, ge=0.0, le=1.0)


class ItineraryDayPayload(BaseModel):
    day: int = Field(ge=1, le=60)
    distance_km: float = Field(ge=0.0)
    stops: int = Field(ge=0, le=1000)
    poi_names: list[str] = Field(default_factory=list)


class ItineraryHistoryCreatePayload(BaseModel):
    user_email: str
    query_text: str = Field(min_length=1, max_length=500)
    num_days: int = Field(ge=1, le=60)
    total_days: int = Field(ge=1, le=60)
    total_stops: int = Field(ge=0, le=5000)
    total_distance_km: float = Field(ge=0.0)
    total_distance_m: int = Field(ge=0)
    avg_distance_per_day_km: float = Field(ge=0.0)
    avg_stops_per_day: float = Field(ge=0.0)
    k_optimal: int = Field(ge=1, le=100)
    silhouette_score: float
    davies_bouldin_index: float
    wcss: float
    precision_score: float = Field(ge=0.0, le=1.0)
    recall_score: float = Field(ge=0.0, le=1.0)
    f1_score: float = Field(ge=0.0, le=1.0)
    hotel_name: str | None = Field(default=None, max_length=300)
    hotel_lat: float | None = None
    hotel_lon: float | None = None
    itinerary_days: list[ItineraryDayPayload] = Field(default_factory=list)


def _serialize_cluster_history_row(row: dict, *, include_user: bool = False) -> dict:
    item = dict(row)
    created_at = item.get("created_at")
    if isinstance(created_at, datetime):
        item["created_at"] = created_at.isoformat()
    if "selected_destinations_json" in item:
        item["selected_destinations"] = item.pop("selected_destinations_json")
    if "filtered_destinations_json" in item:
        item["filtered_destinations"] = item.pop("filtered_destinations_json")
    if "analysis_json" in item:
        item["analysis"] = item.pop("analysis_json")
    if "selection_json" in item:
        item["selection"] = item.pop("selection_json")
    if "routes_json" in item:
        item["routes"] = item.pop("routes_json")
    if not include_user:
        for key in ("user_id", "user_name", "user_email"):
            item.pop(key, None)
    return item


CLUSTER_HISTORY_SELECT_FIELDS = """
    h.id,
    h.query_text,
    h.num_days,
    h.total_pois,
    h.k_optimal,
    h.silhouette_score,
    h.davies_bouldin_index,
    h.wcss,
    h.precision_score,
    h.recall_score,
    h.f1_score,
    COALESCE(h.selected_destinations_json, '[]'::jsonb) AS selected_destinations_json,
    COALESCE(NULLIF(h.hotel_name, ''), 'Tidak diketahui') AS hotel_name,
    h.hotel_lat,
    h.hotel_lon,
    h.top_k,
    h.generation_mode,
    h.daily_destination_limit,
    COALESCE(h.filtered_destinations_json, '[]'::jsonb) AS filtered_destinations_json,
    COALESCE(h.analysis_json, '{}'::jsonb) AS analysis_json,
    COALESCE(h.selection_json, '{}'::jsonb) AS selection_json,
    COALESCE(h.routes_json, '{}'::jsonb) AS routes_json,
    h.created_at
"""


@router.post("/auth/register")
async def register_account(payload: AuthPayload):
    role = payload.role.strip().lower()
    if role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Role tidak valid."})
    if role == "admin":
        raise HTTPException(
            status_code=403,
            detail={"status": "error", "message": "Pendaftaran admin tidak diizinkan."},
        )
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama wajib diisi."})
    email = _normalize_email(payload.email)

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
            RETURNING id, name, email, role, created_at
            """,
            (name, email, _hash_password(payload.password), role),
        )
        user = dict(cur.fetchone())
        conn.commit()
        return {"status": "success", "user": user}
    except Exception as exc:
        if conn:
            conn.rollback()
        message = str(exc)
        if "app_users_email_key" in message:
            raise HTTPException(status_code=409, detail={"status": "error", "message": "Email sudah terdaftar."})
        raise HTTPException(status_code=500, detail={"status": "error", "message": message})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/auth/login")
async def login_account(payload: AuthPayload):
    role = payload.role.strip().lower()
    if role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Role tidak valid."})
    email = _normalize_email(payload.email)

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            """
            SELECT id, name, email, role, password_hash
            FROM app_users
            WHERE LOWER(email) = LOWER(%s) AND role = %s
            LIMIT 1
            """,
            (email, role),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail={"status": "error", "message": "Email atau password salah."})
        if not _verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail={"status": "error", "message": "Email atau password salah."})
        return {
            "status": "success",
            "user": _serialize_auth_user(row),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordPayload):
    role = _validate_auth_role(payload.role)

    email = _normalize_email(payload.email)
    conn = None
    cur = None
    debug_reset_url: str | None = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            """
            SELECT id, name, email, role
            FROM app_users
            WHERE LOWER(email) = LOWER(%s) AND role = %s
            LIMIT 1
            """,
            (email, role),
        )
        row = cur.fetchone()
        if row:
            raw_token = generate_reset_token()
            token_hash = hash_reset_token(raw_token)
            expires_at = utcnow() + timedelta(hours=reset_token_expiry_hours())
            cur.execute(
                """
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE user_id = %s AND used_at IS NULL
                """,
                (row["id"],),
            )
            cur.execute(
                """
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                VALUES (%s, %s, %s)
                """,
                (row["id"], token_hash, expires_at),
            )
            reset_url = build_reset_password_url(raw_token, role=role)
            sent = send_password_reset_email(
                recipient=row["email"],
                reset_url=reset_url,
                user_name=row["name"],
                role=role,
            )
            if not sent and os.getenv("AUTH_DEBUG_RESET", "").strip().lower() in {"1", "true", "yes"}:
                debug_reset_url = reset_url
            conn.commit()
        else:
            conn.commit()

        response: dict = {
            "status": "success",
            "message": FORGOT_PASSWORD_SUCCESS_MESSAGE,
        }
        if debug_reset_url:
            response["debug_reset_url"] = debug_reset_url
        return response
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordPayload):
    role = _validate_auth_role(payload.role)

    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Token reset tidak valid."})

    token_hash = hash_reset_token(token)
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            """
            SELECT
                t.id AS token_id,
                t.user_id,
                t.expires_at,
                t.used_at,
                u.name,
                u.email,
                u.role
            FROM password_reset_tokens t
            JOIN app_users u ON u.id = t.user_id
            WHERE t.token_hash = %s
              AND u.role = %s
            ORDER BY t.created_at DESC
            LIMIT 1
            """,
            (token_hash, role),
        )
        row = cur.fetchone()
        if not row or row["used_at"] is not None:
            raise HTTPException(
                status_code=400,
                detail={"status": "error", "message": "Token reset tidak valid atau sudah dipakai."},
            )

        expires_at = row["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < utcnow():
            raise HTTPException(
                status_code=400,
                detail={"status": "error", "message": "Token reset sudah kedaluwarsa. Minta tautan baru."},
            )

        new_hash = _hash_password(payload.new_password)
        cur.execute(
            """
            UPDATE app_users
            SET password_hash = %s
            WHERE id = %s
            """,
            (new_hash, row["user_id"]),
        )
        cur.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = NOW()
            WHERE id = %s
            """,
            (row["token_id"],),
        )
        conn.commit()
        return {
            "status": "success",
            "message": "Password berhasil diperbarui. Silakan masuk kembali.",
            "user": {
                "id": row["user_id"],
                "name": row["name"],
                "email": row["email"],
                "role": row["role"],
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/auth/google")
async def login_with_google(payload: GoogleAuthPayload):
    role = _validate_auth_role(payload.role)

    try:
        google_user = verify_google_id_token(payload.credential.strip())
    except ValueError as exc:
        raise HTTPException(status_code=401, detail={"status": "error", "message": str(exc)}) from exc

    email = _normalize_email(google_user["email"])
    google_sub = google_user.get("google_sub") or None
    display_name = (google_user["name"] or email.split("@")[0]).strip()

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)

        row = None
        if google_sub:
            cur.execute(
                """
                SELECT id, name, email, role, google_sub
                FROM app_users
                WHERE google_sub = %s AND role = %s
                LIMIT 1
                """,
                (google_sub, role),
            )
            row = cur.fetchone()

        if not row:
            cur.execute(
                """
                SELECT id, name, email, role, google_sub
                FROM app_users
                WHERE LOWER(email) = LOWER(%s) AND role = %s
                LIMIT 1
                """,
                (email, role),
            )
            row = cur.fetchone()

        if not row and role == "user":
            import secrets as _secrets

            cur.execute(
                """
                INSERT INTO app_users (name, email, password_hash, role, google_sub)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, name, email, role, google_sub
                """,
                (display_name, email, _hash_password(_secrets.token_urlsafe(24)), role, google_sub),
            )
            row = dict(cur.fetchone())
            conn.commit()
            return {"status": "success", "user": _serialize_auth_user(row)}

        if not row:
            raise HTTPException(
                status_code=403,
                detail={
                    "status": "error",
                    "message": "Akun admin dengan email Google ini belum terdaftar. Hubungi super admin.",
                },
            )

        if google_sub and row.get("google_sub") and row["google_sub"] != google_sub:
            raise HTTPException(
                status_code=403,
                detail={"status": "error", "message": "Email Google tidak cocok dengan akun terdaftar."},
            )

        final_name = (row["name"] or display_name).strip()
        cur.execute(
            """
            UPDATE app_users
            SET google_sub = COALESCE(google_sub, %s),
                name = %s
            WHERE id = %s
            """,
            (google_sub, final_name, row["id"]),
        )
        conn.commit()

        return {
            "status": "success",
            "user": {
                "id": row["id"],
                "name": final_name,
                "email": row["email"],
                "role": row["role"],
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.patch("/auth/profile")
async def update_own_profile(payload: ProfileUpdatePayload):
    email = _normalize_email(payload.email)

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            """
            SELECT id, name, email, password_hash, role
            FROM app_users
            WHERE LOWER(email) = LOWER(%s)
            LIMIT 1
            """,
            (email,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Akun tidak ditemukan."})
        if row["role"] != "user":
            raise HTTPException(
                status_code=403,
                detail={
                    "status": "error",
                    "message": "Hanya pengguna biasa yang dapat mengubah profil di sini.",
                },
            )
        if not _verify_password(payload.current_password, row["password_hash"]):
            raise HTTPException(
                status_code=401,
                detail={"status": "error", "message": "Password saat ini salah."},
            )

        raw_name = (payload.name if payload.name is not None else row["name"]) or ""
        new_name = (raw_name.strip() or row["name"])[:200]
        if not new_name:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Nama wajib diisi."})

        new_hash = row["password_hash"]
        np = (payload.new_password or "").strip()
        if np:
            if len(np) < 6:
                raise HTTPException(
                    status_code=400,
                    detail={"status": "error", "message": "Password baru minimal 6 karakter."},
                )
            new_hash = _hash_password(np)

        cur.execute(
            """
            UPDATE app_users
            SET name = %s, password_hash = %s
            WHERE id = %s
            RETURNING id, name, email, role, created_at
            """,
            (new_name, new_hash, row["id"]),
        )
        updated = dict(cur.fetchone())
        conn.commit()
        return {
            "status": "success",
            "user": {
                "id": updated["id"],
                "name": updated["name"],
                "email": updated["email"],
                "role": updated["role"],
            },
        }
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)}) from exc
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/cluster-history")
async def create_cluster_history(payload: ClusterHistoryCreatePayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        user_email = _normalize_email(payload.user_email)
        cur.execute("SELECT id, role FROM app_users WHERE LOWER(email) = LOWER(%s) LIMIT 1", (user_email,))
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "User tidak ditemukan."})
        if user_row["role"] != "user":
            raise HTTPException(
                status_code=403,
                detail={"status": "error", "message": "Riwayat cluster hanya untuk role user."},
            )
        cur.execute(
            """
            INSERT INTO cluster_history (
                user_id, query_text, num_days, total_pois, k_optimal,
                silhouette_score, davies_bouldin_index, wcss,
                precision_score, recall_score, f1_score, selected_destinations_json,
                hotel_name, hotel_lat, hotel_lon,
                top_k, generation_mode, daily_destination_limit,
                filtered_destinations_json, analysis_json, selection_json, routes_json
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s,
                %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb
            )
            RETURNING id, created_at
            """,
            (
                user_row["id"],
                payload.query_text.strip(),
                payload.num_days,
                payload.total_pois,
                payload.k_optimal,
                payload.silhouette_score,
                payload.davies_bouldin_index,
                payload.wcss,
                payload.precision_score,
                payload.recall_score,
                payload.f1_score,
                json.dumps(payload.selected_destinations[:200]),
                (payload.hotel_name or "Tidak diketahui").strip()[:300],
                payload.hotel_lat,
                payload.hotel_lon,
                payload.top_k,
                (payload.generation_mode or "auto").strip()[:20] if payload.generation_mode else None,
                payload.daily_destination_limit,
                json.dumps(payload.filtered_destinations[:2000]),
                json.dumps(payload.analysis or {}),
                json.dumps(payload.selection or {}),
                json.dumps(payload.routes or {}),
            ),
        )
        created = dict(cur.fetchone())
        conn.commit()
        return {"status": "success", "item": created}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/cluster-history")
async def get_user_cluster_history(
    user_email: str = Query(..., max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    query_text: str | None = Query(default=None, max_length=300),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        email = _normalize_email(user_email)
        cur.execute("SELECT id, role FROM app_users WHERE LOWER(email) = LOWER(%s) LIMIT 1", (email,))
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "User tidak ditemukan."})
        if user_row["role"] != "user":
            raise HTTPException(
                status_code=403,
                detail={"status": "error", "message": "Riwayat cluster hanya untuk role user."},
            )

        d_from = _parse_optional_iso_date("date_from", date_from)
        d_to = _parse_optional_iso_date("date_to", date_to)
        if d_from and d_to and d_from > d_to:
            raise HTTPException(
                status_code=400,
                detail={"status": "error", "message": "date_from tidak boleh setelah date_to."},
            )

        filters: list[str] = ["h.user_id = %s"]
        filter_params: list[object] = [user_row["id"]]
        if d_from:
            filters.append("CAST(h.created_at AS DATE) >= %s")
            filter_params.append(d_from)
        if d_to:
            filters.append("CAST(h.created_at AS DATE) <= %s")
            filter_params.append(d_to)
        q = (query_text or "").strip()
        if q:
            filters.append("LOWER(h.query_text) LIKE LOWER(%s)")
            filter_params.append(f"%{q}%")
        where_sql = "WHERE " + " AND ".join(filters)

        cur.execute(
            f"""
            SELECT
                COUNT(*) AS total_runs,
                COALESCE(AVG(h.precision_score), 0) AS avg_precision,
                COALESCE(AVG(h.recall_score), 0) AS avg_recall,
                COALESCE(AVG(h.f1_score), 0) AS avg_f1
            FROM cluster_history h
            {where_sql}
            """,
            tuple(filter_params),
        )
        summary = dict(cur.fetchone())
        cur.execute(
            f"""
            SELECT
                {CLUSTER_HISTORY_SELECT_FIELDS}
            FROM cluster_history h
            {where_sql}
            ORDER BY h.created_at DESC
            LIMIT %s
            """,
            tuple([*filter_params, limit]),
        )
        items = [_serialize_cluster_history_row(dict(row)) for row in cur.fetchall()]
        return {"status": "success", "summary": summary, "items": items}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/itinerary-history")
async def create_itinerary_history(payload: ItineraryHistoryCreatePayload):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        user_email = _normalize_email(payload.user_email)
        cur.execute("SELECT id, role FROM app_users WHERE LOWER(email) = LOWER(%s) LIMIT 1", (user_email,))
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "User tidak ditemukan."})
        if user_row["role"] != "user":
            raise HTTPException(
                status_code=403,
                detail={"status": "error", "message": "Riwayat itinerary hanya untuk role user."},
            )
        cur.execute(
            """
            INSERT INTO itinerary_history (
                user_id, query_text, num_days, total_days, total_stops,
                total_distance_km, total_distance_m, avg_distance_per_day_km, avg_stops_per_day,
                k_optimal, silhouette_score, davies_bouldin_index, wcss,
                precision_score, recall_score, f1_score,
                hotel_name, hotel_lat, hotel_lon, itinerary_days_json
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s::jsonb
            )
            RETURNING id, created_at
            """,
            (
                user_row["id"],
                payload.query_text.strip(),
                payload.num_days,
                payload.total_days,
                payload.total_stops,
                payload.total_distance_km,
                payload.total_distance_m,
                payload.avg_distance_per_day_km,
                payload.avg_stops_per_day,
                payload.k_optimal,
                payload.silhouette_score,
                payload.davies_bouldin_index,
                payload.wcss,
                payload.precision_score,
                payload.recall_score,
                payload.f1_score,
                (payload.hotel_name or "Tidak diketahui").strip()[:300],
                payload.hotel_lat,
                payload.hotel_lon,
                json.dumps([day.model_dump() for day in payload.itinerary_days[:100]]),
            ),
        )
        created = dict(cur.fetchone())
        conn.commit()
        return {"status": "success", "item": created}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/itinerary-history")
async def get_user_itinerary_history(
    user_email: str = Query(..., max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    query_text: str | None = Query(default=None, max_length=300),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        email = _normalize_email(user_email)
        cur.execute("SELECT id, role FROM app_users WHERE LOWER(email) = LOWER(%s) LIMIT 1", (email,))
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "User tidak ditemukan."})
        if user_row["role"] != "user":
            raise HTTPException(
                status_code=403,
                detail={"status": "error", "message": "Riwayat itinerary hanya untuk role user."},
            )

        d_from = _parse_optional_iso_date("date_from", date_from)
        d_to = _parse_optional_iso_date("date_to", date_to)
        if d_from and d_to and d_from > d_to:
            raise HTTPException(
                status_code=400,
                detail={"status": "error", "message": "date_from tidak boleh setelah date_to."},
            )

        filters: list[str] = ["h.user_id = %s"]
        filter_params: list[object] = [user_row["id"]]
        if d_from:
            filters.append("CAST(h.created_at AS DATE) >= %s")
            filter_params.append(d_from)
        if d_to:
            filters.append("CAST(h.created_at AS DATE) <= %s")
            filter_params.append(d_to)
        q = (query_text or "").strip()
        if q:
            filters.append("LOWER(h.query_text) LIKE LOWER(%s)")
            filter_params.append(f"%{q}%")
        where_sql = "WHERE " + " AND ".join(filters)

        cur.execute(
            f"""
            SELECT
                COUNT(*) AS total_runs,
                COALESCE(AVG(h.total_distance_km), 0) AS avg_total_distance_km,
                COALESCE(AVG(h.total_stops), 0) AS avg_total_stops,
                COALESCE(AVG(h.f1_score), 0) AS avg_f1
            FROM itinerary_history h
            {where_sql}
            """,
            tuple(filter_params),
        )
        summary = dict(cur.fetchone())
        cur.execute(
            f"""
            SELECT
                h.id,
                h.query_text,
                h.num_days,
                h.total_days,
                h.total_stops,
                h.total_distance_km,
                h.total_distance_m,
                h.avg_distance_per_day_km,
                h.avg_stops_per_day,
                h.k_optimal,
                h.silhouette_score,
                h.davies_bouldin_index,
                h.wcss,
                h.precision_score,
                h.recall_score,
                h.f1_score,
                COALESCE(NULLIF(h.hotel_name, ''), 'Tidak diketahui') AS hotel_name,
                h.hotel_lat,
                h.hotel_lon,
                COALESCE(h.itinerary_days_json, '[]'::jsonb) AS itinerary_days,
                h.created_at
            FROM itinerary_history h
            {where_sql}
            ORDER BY h.created_at DESC
            LIMIT %s
            """,
            tuple([*filter_params, limit]),
        )
        items = [dict(row) for row in cur.fetchall()]
        for row in items:
            created_at = row.get("created_at")
            if isinstance(created_at, datetime):
                row["created_at"] = created_at.isoformat()
        return {"status": "success", "summary": summary, "items": items}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/cluster-history")
async def get_admin_cluster_history(
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    user_email: str | None = Query(default=None, max_length=200),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)

        d_from = _parse_optional_iso_date("date_from", date_from)
        d_to = _parse_optional_iso_date("date_to", date_to)
        if d_from and d_to and d_from > d_to:
            raise HTTPException(
                status_code=400,
                detail={"status": "error", "message": "date_from tidak boleh setelah date_to."},
            )

        user_q = (user_email or "").strip()
        filters: list[str] = []
        filter_params: list[object] = []
        if d_from:
            filters.append("CAST(h.created_at AS DATE) >= %s")
            filter_params.append(d_from)
        if d_to:
            filters.append("CAST(h.created_at AS DATE) <= %s")
            filter_params.append(d_to)
        if user_q:
            like = f"%{user_q}%"
            filters.append("(LOWER(u.email) LIKE LOWER(%s) OR LOWER(u.name) LIKE LOWER(%s))")
            filter_params.extend([like, like])

        where_sql = ""
        if filters:
            where_sql = "WHERE " + " AND ".join(filters)

        cur.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM cluster_history h
            JOIN app_users u ON u.id = h.user_id
            {where_sql}
            """,
            tuple(filter_params),
        )
        total_runs = int(cur.fetchone()["count"])

        cur.execute(
            f"""
            SELECT
                COALESCE(AVG(h.precision_score), 0) AS avg_precision,
                COALESCE(AVG(h.recall_score), 0) AS avg_recall,
                COALESCE(AVG(h.f1_score), 0) AS avg_f1
            FROM cluster_history h
            JOIN app_users u ON u.id = h.user_id
            {where_sql}
            """,
            tuple(filter_params),
        )
        summary = dict(cur.fetchone())
        summary["total_runs"] = total_runs

        cur.execute(
            f"""
            SELECT
                {CLUSTER_HISTORY_SELECT_FIELDS},
                u.id AS user_id,
                u.name AS user_name,
                u.email AS user_email
            FROM cluster_history h
            JOIN app_users u ON u.id = h.user_id
            {where_sql}
            ORDER BY h.created_at DESC
            LIMIT 200
            """,
            tuple(filter_params),
        )
        items = [_serialize_cluster_history_row(dict(row), include_user=True) for row in cur.fetchall()]
        return {"status": "success", "summary": summary, "items": items}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/cluster-history/{history_id}")
async def get_admin_cluster_history_item(
    history_id: int = Path(ge=1),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            f"""
            SELECT
                {CLUSTER_HISTORY_SELECT_FIELDS},
                u.id AS user_id,
                u.name AS user_name,
                u.email AS user_email
            FROM cluster_history h
            JOIN app_users u ON u.id = h.user_id
            WHERE h.id = %s
            LIMIT 1
            """,
            (history_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Riwayat tidak ditemukan."})
        item = _serialize_cluster_history_row(dict(row), include_user=True)
        return {"status": "success", "item": item}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/cluster-history/{history_id}")
async def get_user_cluster_history_item(
    history_id: int = Path(ge=1),
    user_email: str = Query(..., max_length=200),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        email = _normalize_email(user_email)
        cur.execute("SELECT id, role FROM app_users WHERE LOWER(email) = LOWER(%s) LIMIT 1", (email,))
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "User tidak ditemukan."})
        if user_row["role"] != "user":
            raise HTTPException(
                status_code=403,
                detail={"status": "error", "message": "Riwayat cluster hanya untuk role user."},
            )
        cur.execute(
            f"""
            SELECT
                {CLUSTER_HISTORY_SELECT_FIELDS}
            FROM cluster_history h
            WHERE h.id = %s AND h.user_id = %s
            LIMIT 1
            """,
            (history_id, user_row["id"]),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Riwayat tidak ditemukan."})
        item = _serialize_cluster_history_row(dict(row))
        return {"status": "success", "item": item}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/itinerary-history")
async def get_admin_itinerary_history(
    date_from: str | None = Query(default=None, max_length=10),
    date_to: str | None = Query(default=None, max_length=10),
    user_email: str | None = Query(default=None, max_length=200),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)

        d_from = _parse_optional_iso_date("date_from", date_from)
        d_to = _parse_optional_iso_date("date_to", date_to)
        if d_from and d_to and d_from > d_to:
            raise HTTPException(
                status_code=400,
                detail={"status": "error", "message": "date_from tidak boleh setelah date_to."},
            )

        user_q = (user_email or "").strip()
        filters: list[str] = []
        filter_params: list[object] = []
        if d_from:
            filters.append("CAST(h.created_at AS DATE) >= %s")
            filter_params.append(d_from)
        if d_to:
            filters.append("CAST(h.created_at AS DATE) <= %s")
            filter_params.append(d_to)
        if user_q:
            like = f"%{user_q}%"
            filters.append("(LOWER(u.email) LIKE LOWER(%s) OR LOWER(u.name) LIKE LOWER(%s))")
            filter_params.extend([like, like])

        where_sql = ""
        if filters:
            where_sql = "WHERE " + " AND ".join(filters)

        cur.execute(
            f"""
            SELECT
                COUNT(*) AS total_runs,
                COALESCE(AVG(h.total_distance_km), 0) AS avg_total_distance_km,
                COALESCE(AVG(h.total_stops), 0) AS avg_total_stops,
                COALESCE(AVG(h.f1_score), 0) AS avg_f1
            FROM itinerary_history h
            JOIN app_users u ON u.id = h.user_id
            {where_sql}
            """,
            tuple(filter_params),
        )
        summary = dict(cur.fetchone())

        cur.execute(
            f"""
            SELECT
                h.id,
                h.query_text,
                h.num_days,
                h.total_days,
                h.total_stops,
                h.total_distance_km,
                h.total_distance_m,
                h.avg_distance_per_day_km,
                h.avg_stops_per_day,
                h.k_optimal,
                h.silhouette_score,
                h.davies_bouldin_index,
                h.wcss,
                h.precision_score,
                h.recall_score,
                h.f1_score,
                COALESCE(NULLIF(h.hotel_name, ''), 'Tidak diketahui') AS hotel_name,
                h.hotel_lat,
                h.hotel_lon,
                COALESCE(h.itinerary_days_json, '[]'::jsonb) AS itinerary_days,
                h.created_at,
                u.id AS user_id,
                u.name AS user_name,
                u.email AS user_email
            FROM itinerary_history h
            JOIN app_users u ON u.id = h.user_id
            {where_sql}
            ORDER BY h.created_at DESC
            LIMIT 200
            """,
            tuple(filter_params),
        )
        items = [dict(row) for row in cur.fetchall()]
        for row in items:
            created_at = row.get("created_at")
            if isinstance(created_at, datetime):
                row["created_at"] = created_at.isoformat()
        return {"status": "success", "summary": summary, "items": items}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.patch("/admin/cluster-history/{history_id}")
async def update_admin_cluster_history(
    payload: ClusterHistoryAdminUpdatePayload,
    history_id: int = Path(ge=1),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)

        updates: list[tuple[str, object]] = []
        if payload.query_text is not None:
            value = payload.query_text.strip()
            if not value:
                raise HTTPException(status_code=400, detail={"status": "error", "message": "Query wajib diisi."})
            updates.append(("query_text", value))
        if payload.num_days is not None:
            updates.append(("num_days", payload.num_days))
        if payload.total_pois is not None:
            updates.append(("total_pois", payload.total_pois))
        if payload.k_optimal is not None:
            updates.append(("k_optimal", payload.k_optimal))
        if payload.silhouette_score is not None:
            updates.append(("silhouette_score", payload.silhouette_score))
        if payload.davies_bouldin_index is not None:
            updates.append(("davies_bouldin_index", payload.davies_bouldin_index))
        if payload.wcss is not None:
            updates.append(("wcss", payload.wcss))
        if payload.precision_score is not None:
            updates.append(("precision_score", payload.precision_score))
        if payload.recall_score is not None:
            updates.append(("recall_score", payload.recall_score))
        if payload.f1_score is not None:
            updates.append(("f1_score", payload.f1_score))

        if not updates:
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Tidak ada perubahan."})

        set_sql = ", ".join(f"{col} = %s" for col, _ in updates)
        params = [value for _, value in updates]
        params.append(history_id)
        cur.execute(f"UPDATE cluster_history SET {set_sql} WHERE id = %s RETURNING id", tuple(params))
        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Riwayat tidak ditemukan."})

        cur.execute(
            f"""
            SELECT
                {CLUSTER_HISTORY_SELECT_FIELDS},
                u.id AS user_id,
                u.name AS user_name,
                u.email AS user_email
            FROM cluster_history h
            JOIN app_users u ON u.id = h.user_id
            WHERE h.id = %s
            LIMIT 1
            """,
            (history_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Riwayat tidak ditemukan."})
        item = _serialize_cluster_history_row(dict(row), include_user=True)
        conn.commit()
        return {"status": "success", "item": item}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.delete("/admin/cluster-history/{history_id}")
async def delete_admin_cluster_history(
    history_id: int = Path(ge=1),
):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            "DELETE FROM cluster_history WHERE id = %s RETURNING id",
            (history_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"status": "error", "message": "Riwayat tidak ditemukan."})
        conn.commit()
        deleted = int(row["id"])
        return {"status": "success", "deleted_id": deleted}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as exc:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.get("/admin/users")
async def get_admin_users():
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        ensure_auth_and_history_tables(cur)
        cur.execute(
            """
            SELECT id, name, email, role, created_at
            FROM app_users
            ORDER BY created_at DESC
            """
        )
        items = [dict(row) for row in cur.fetchall()]
        for row in items:
            created_at = row.get("created_at")
            if isinstance(created_at, datetime):
                row["created_at"] = created_at.isoformat()
        return {"status": "success", "items": items}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)})
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
