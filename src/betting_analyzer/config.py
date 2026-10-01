"""Carga de configuración (claves de API) desde variables de entorno o un archivo .env."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    odds_api_key: str | None
    football_data_api_key: str | None


def get_settings() -> Settings:
    return Settings(
        odds_api_key=os.environ.get("ODDS_API_KEY") or None,
        football_data_api_key=os.environ.get("FOOTBALL_DATA_API_KEY") or None,
    )


class MissingApiKeyError(RuntimeError):
    """Se requiere una clave de API que no está configurada."""
