"""Ligas foco del usuario: segundas/terceras divisiones de Noruega, Grecia, Italia, y las
ligas principales de Kenia, Panamá e Israel.

`league_id` confirmados en vivo (2026-10) contra API-Football vía `betting-analyzer leagues
--country "<país>"`. `season=2023` porque el plan Free solo da acceso a temporadas 2022-2024
(no a la temporada actual), y 2023 es la que tiene más partidos confirmados en pruebas (todas
con 200-390 partidos finalizados).

Casos especiales, revisar antes de usar en producción:
  - Noruega 3ª división y Grecia 3ª división están repartidas en varios grupos regionales
    (6 y 10 respectivamente); aquí solo se incluye el grupo 1 de cada una como muestra.
  - Kenia: en el catálogo de API-Football solo aparecen "FKF Premier League" y "Super League"
    (sin una 3ª división clara), así que se usa "Super League" como aproximación a 2ª división.
  - Panamá: API-Football solo tiene UNA liga para este país ("Liga Panameña de Fútbol", la
    primera división). No existe ninguna 2ª/3ª división en su catálogo, a ningún plan.
  - La cuenta usada para validar quedó suspendida por el proveedor a mitad de la verificación
    (ver README); antes de correr `focus` en producción, confirma que la cuenta esté activa.
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
    FocusLeague(label="Noruega - 1. Division (2ª división)", country="Norway", league_id=104, season=2023),
    FocusLeague(label="Noruega - 2. Division Grupo 1 (3ª división)", country="Norway", league_id=473, season=2023),
    FocusLeague(label="Grecia - Super League 2 (2ª división)", country="Greece", league_id=494, season=2023),
    FocusLeague(label="Grecia - Gamma Ethniki Grupo 1 (3ª división)", country="Greece", league_id=576, season=2023),
    FocusLeague(label="Italia - Serie B (2ª división)", country="Italy", league_id=136, season=2023),
    FocusLeague(label="Italia - Serie C Girone A (3ª división)", country="Italy", league_id=138, season=2023),
    FocusLeague(label="Kenia - Super League (aprox. 2ª división)", country="Kenya", league_id=277, season=2023),
    FocusLeague(label="Panamá - LPF (única división en el catálogo)", country="Panama", league_id=304, season=2023),
    FocusLeague(label="Israel - Liga Leumit (2ª división)", country="Israel", league_id=382, season=2023),
    FocusLeague(label="Israel - Liga Alef (3ª división)", country="Israel", league_id=496, season=2023),
]
