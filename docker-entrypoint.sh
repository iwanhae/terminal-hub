#!/bin/bash
set -e

BACKUP_FILE="/tmp/home-backup.tar.gz"
MARKER_FILE="${HOME}/.terminal-hub-initialized"
USER="ubuntu"

# If HOME is empty or not initialized, restore from backup
if [ ! -f "${MARKER_FILE}" ]; then
    echo "Initializing HOME directory from backup..."
    if [ -f "${BACKUP_FILE}" ]; then
        sudo tar -xzf "${BACKUP_FILE}" -C "${HOME}"
        sudo chown -R $USER:$USER "${HOME}"
        echo "HOME directory restored from backup."
    else
        echo "Warning: No backup file found at ${BACKUP_FILE}"
    fi
    touch "${MARKER_FILE}"
fi

# Execute the terminal-hub binary
exec runuser -u $USER -- terminal-hub "$@"