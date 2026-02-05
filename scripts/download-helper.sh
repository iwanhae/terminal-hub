#!/bin/bash
# Terminal Hub File Download Helper
# Usage: download-file <path-to-file> [custom-filename]
# Alias: dl <path-to-file> [custom-filename]

download-file() {
    local filepath="$1"
    local filename="${2:-$(basename "$filepath")}"

    if [ ! -e "$filepath" ]; then
        echo "Error: File not found: $filepath" >&2
        return 1
    fi

    local abspath=$(realpath "$filepath")

    # Emit OSC escape sequence to trigger frontend download
    printf '\033]FILE;download:path=%s,name=%s\007' "$abspath" "$filename"
    echo ""
    echo "[Download] $filename"
}

alias dl='download-file'
