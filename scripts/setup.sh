#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo 'Instala uv: python3 -m pip install uv==0.12.23'; exit 1; }
command -v tesseract >/dev/null || { echo 'Instala Tesseract 5 con el gestor de paquetes del sistema (Debian/Ubuntu: apt-get install tesseract-ocr).'; exit 1; }
export UV_CACHE_DIR="${UV_CACHE_DIR:-$PWD/.runtime/uv-cache}"
uv sync --frozen "$@"
mkdir -p .runtime/tessdata
model=.runtime/tessdata/spa.traineddata
checksum=6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464
if ! printf '%s  %s\n' "$checksum" "$model" | sha256sum --check --status 2>/dev/null; then
  temp_model=$(mktemp .runtime/tessdata/spa.XXXXXX)
  trap 'rm -f "$temp_model"' EXIT
  curl --fail --location --retry 2 --max-time 60 \
    https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/spa.traineddata -o "$temp_model"
  printf '%s  %s\n' "$checksum" "$temp_model" | sha256sum --check --status
  mv "$temp_model" "$model"
fi
.venv/bin/python -c 'from app.models import EducationPackage; print("Dependencias y contrato disponibles")'
tesseract --tessdata-dir .runtime/tessdata --list-langs
