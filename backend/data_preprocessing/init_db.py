from pathlib import Path

from database import get_connection


def main() -> None:
    sql_path = Path(__file__).resolve().parent / "schema.sql"
    sql = sql_path.read_text(encoding="utf-8")

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()

    print("Schema initialized successfully.")


if __name__ == "__main__":
    main()
