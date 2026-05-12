import os

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    port_raw = os.getenv("DB_PORT", "5432")
    try:
        port_val = int(str(port_raw).strip())
    except (TypeError, ValueError):
        port_val = 5432
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "wisata_jakarta"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        port=port_val,
        cursor_factory=RealDictCursor,
        connect_timeout=10,
    )
