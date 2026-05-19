import hashlib
import json
import os
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from database import get_connection

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
            "user": {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "role": row["role"],
            },
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
                hotel_name, hotel_lat, hotel_lon
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
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
                (payload.hotel_name or "").strip()[:300] or None,
                payload.hotel_lat,
                payload.hotel_lon,
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
                COALESCE(h.selected_destinations_json, '[]'::jsonb) AS selected_destinations,
                h.hotel_name,
                h.hotel_lat,
                h.hotel_lon,
                h.created_at,
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
        items = [dict(row) for row in cur.fetchall()]
        for row in items:
            created_at = row.get("created_at")
            if isinstance(created_at, datetime):
                row["created_at"] = created_at.isoformat()
        return {"status": "success", "summary": summary, "items": items}
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
            """
            SELECT
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
                COALESCE(h.selected_destinations_json, '[]'::jsonb) AS selected_destinations,
                h.hotel_name,
                h.hotel_lat,
                h.hotel_lon,
                h.created_at,
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
        item = dict(cur.fetchone())
        created_at = item.get("created_at")
        if isinstance(created_at, datetime):
            item["created_at"] = created_at.isoformat()
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
