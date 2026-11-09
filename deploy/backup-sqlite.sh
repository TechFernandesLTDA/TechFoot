#!/bin/sh
# Backup online do SQLite do TechFoot. Pensado para cron antes das 03:00,
# quando o restic diário do servidor coleta os arquivos. Não instala nada.
set -eu

DB="${TECHFOOT_DB:-/srv/techfernandes/techfoot/data/techfoot.db}"
DEST="${TECHFOOT_BACKUP_DIR:-/srv/techfernandes/techfoot/data/backups}"
KEEP="${TECHFOOT_BACKUP_KEEP:-14}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 não está no PATH. Instale o cliente no host antes de agendar o cron." >&2
  exit 1
fi
if [ ! -f "$DB" ]; then
  echo "Banco não encontrado: $DB" >&2
  exit 1
fi

mkdir -p "$DEST"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$DEST/techfoot-$stamp.db"
sqlite3 "$DB" ".backup '$out'"
check=$(sqlite3 "$out" "PRAGMA integrity_check;")
if [ "$check" != "ok" ]; then
  echo "Backup falhou no integrity_check: $out" >&2
  exit 1
fi
chmod 0640 "$out"

# Apaga só os backups antigos deste script. Não mexe no banco ao vivo.
ls -1t "$DEST"/techfoot-*.db 2>/dev/null | awk -v keep="$KEEP" 'NR > keep' | while read -r old; do
  rm -f "$old"
done

echo "backup $out"
