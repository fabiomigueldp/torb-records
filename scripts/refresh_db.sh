#!/bin/bash

# This script is intended to be run inside the development Docker container.

DB_FILE="torb.db"
ALEMBIC_CONFIG="alembic.ini" # Assuming alembic.ini is in the project root

# Navigate to the backend directory or ensure paths are correct if run from project root
# For simplicity, this script assumes it's run from the project root.
# If your DB_FILE path in alembic.ini is relative to backend/, adjust accordingly.

echo "Refreshing database: $DB_FILE"

# Remove the existing database file
if [ -f "$DB_FILE" ]; then
    echo "Removing old database file: $DB_FILE"
    rm "$DB_FILE"
else
    echo "No existing database file found to remove."
fi

# Run Alembic migrations to recreate the schema
echo "Applying Alembic migrations..."
alembic -c "$ALEMBIC_CONFIG" upgrade head

echo "Database refresh complete."
