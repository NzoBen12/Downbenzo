"""Ligas foco del usuario: segundas/terceras divisiones de Noruega, Grecia, Italia, y las
ligas principales de Kenia, Panamá e Israel.

Los `league_id` son PLACEHOLDERS (None): hay que confirmarlos en vivo con
`betting-analyzer leagues --country "<país>"` una vez que haya una API_FOOTBALL_KEY real,
porque API-Football no documenta públicamente un listado estable de IDs y estos cambian
entre temporadas/competiciones. No usar estos registros en `analyze`/`focus` hasta rellenar
`league_id` y `season` con los valores reales devueltos por la API.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FocusLeague:
    label: str
    country: str
    league_id: int | None
    season: int | None


FOCUS_LEAGUES: list[FocusLeague] = [
    FocusLeague(label="Noruega - 1. divisjon (2ª división)", country="Norway", league_id=None, season=None),
    FocusLeague(label="Noruega - 2. divisjon (3ª división)", country="Norway", league_id=None, season=None),
    FocusLeague(label="Grecia - Super League 2 (2ª división)", country="Greece", league_id=None, season=None),
    FocusLeague(label="Grecia - Gamma Ethniki (3ª división)", country="Greece", league_id=None, season=None),
    FocusLeague(label="Italia - Serie B (2ª división)", country="Italy", league_id=None, season=None),
    FocusLeague(label="Italia - Serie C (3ª división)", country="Italy", league_id=None, season=None),
    FocusLeague(label="Kenia - Premier League", country="Kenya", league_id=None, season=None),
    FocusLeague(label="Panamá - LPF", country="Panama", league_id=None, season=None),
    FocusLeague(label="Israel - Ligat Ha'Al / Liga Leumit", country="Israel", league_id=None, season=None),
]
