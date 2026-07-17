#!/bin/sh
set -e

echo "Waiting for database..."
python - <<'PYEOF'
import os
import sys
import time

import psycopg

url = os.environ.get("DATABASE_URL", "")
if not url.startswith("postgres"):
    sys.exit(0)

for attempt in range(30):
    try:
        psycopg.connect(url).close()
        break
    except Exception as exc:  # noqa: BLE001
        print(f"  db not ready ({exc}); retrying...")
        time.sleep(2)
else:
    print("Database never became available.")
    sys.exit(1)
PYEOF
echo "Database is up."

python manage.py migrate --noinput
python manage.py seed_groups
python manage.py collectstatic --noinput

if [ "${SEED_DEMO}" = "true" ]; then
    python manage.py seed_demo_data
fi

exec "$@"
