#!/bin/sh
set -e

# Ensure the uploads directory exists and is writable by the app user.
# This covers bind-mounted host directories (e.g. Unraid appdata) that
# may have been created by root with restrictive permissions.
UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"

# Create parent dirs if missing (no-op if they exist).
mkdir -p "$(dirname "$UPLOAD_DIR")" "$UPLOAD_DIR"

# Make the uploads tree world-writable so the app user can always write,
# regardless of host-side ownership. The setgid bit ensures new files
# inherit the directory's group.
chmod -R a+rwX "$UPLOAD_DIR"

# Drop to the non-root app user and exec the real command.
exec gosu app "$@"
