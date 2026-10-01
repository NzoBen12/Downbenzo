"""Carga de configuración (claves de API) desde variables de entorno o un archivo .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from dotenv import load_dotenv

load_dotenv()

ApiFootballProvider = Literal["direct", "rapidapi"]


@dataclass(frozen=True)
class Settings:
    api_football_key: str | None
    api_football_provider: ApiFootballProvider


def get_settings() -> Settings:
    provider = os.environ.get("API_FOOTBALL_PROVIDER", "direct").strip().lower()
    if provider not in ("direct", "rapidapi"):
        raise ValueError(f"API_FOOTBALL_PROVIDER debe ser 'direct' o 'rapidapi', no '{provider}'.")
    return Settings(
        api_football_key=os.environ.get("API_FOOTBALL_KEY") or None,
        api_football_provider=provider,  # type: ignore[arg-type]
    )


class MissingApiKeyError(RuntimeError):
    """Se requiere una clave de API que no está configurada."""
