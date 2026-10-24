import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path(os.getenv("EDU_DATA_DIR", ".data"))
    tessdata_dir: Path = Path(os.getenv("EDU_TESSDATA_DIR", ".runtime/tessdata"))
    max_files: int = min(20, max(1, int(os.getenv("EDU_MAX_FILES", "20"))))
    max_file_bytes: int = int(os.getenv("EDU_MAX_FILE_MB", "10")) * 1024 * 1024
    max_session_bytes: int = int(os.getenv("EDU_MAX_SESSION_MB", "50")) * 1024 * 1024
    max_pages: int = int(os.getenv("EDU_MAX_PAGES", "30"))
    max_text_chars: int = int(os.getenv("EDU_MAX_TEXT_CHARS", "40000"))
    max_generations: int = int(os.getenv("EDU_MAX_GENERATIONS", "10"))
    max_chat: int = int(os.getenv("EDU_MAX_CHAT", "60"))
    max_ai_tokens: int = int(os.getenv("EDU_MAX_AI_TOKENS", "24000"))
    retention_hours: int = int(os.getenv("EDU_RETENTION_HOURS", "24"))
    cookie_secure: bool = os.getenv("EDU_COOKIE_SECURE", "false").lower() == "true"
    ai_mode: str = os.getenv("EDU_AI_MODE", "local")
    ai_key: str = os.getenv("EDU_AI_API_KEY", "")
    ai_model: str = os.getenv("EDU_AI_MODEL", "gemini-2.5-flash-lite" if os.getenv("EDU_AI_MODE") == "gemini" else "gpt-4.1-mini")
    public_origin: str = os.getenv("EDU_PUBLIC_ORIGIN", os.getenv("RENDER_EXTERNAL_URL", "")).rstrip("/")
    extraction_workers: int = int(os.getenv("EDU_EXTRACTION_WORKERS", "2"))

    def __post_init__(self):
        if self.ai_mode not in {"local", "openai", "gemini"}:
            raise ValueError("EDU_AI_MODE debe ser local, openai o gemini")
        for field in ("max_file_bytes", "max_session_bytes", "max_pages", "max_text_chars",
                      "max_generations", "max_chat", "max_ai_tokens", "retention_hours", "extraction_workers"):
            if getattr(self, field) <= 0:
                raise ValueError(f"{field} debe ser positivo")
