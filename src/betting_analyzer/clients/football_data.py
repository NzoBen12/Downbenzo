"""Cliente para football-data.org, usado para traer resultados históricos de partidos."""

from __future__ import annotations

from dataclasses import dataclass

import requests

from betting_analyzer.config import MissingApiKeyError, get_settings

BASE_URL = "https://api.football-data.org/v4"


@dataclass(frozen=True)
class MatchResult:
    home_team: str
    away_team: str
    home_goals: int
    away_goals: int


class FootballDataClient:
    def __init__(self, api_key: str | None = None, session: requests.Session | None = None):
        self.api_key = api_key or get_settings().football_data_api_key
        if not self.api_key:
            raise MissingApiKeyError(
                "Falta FOOTBALL_DATA_API_KEY. Configúrala en .env o como variable de entorno. "
                "Obtén una clave gratuita en https://www.football-data.org"
            )
        self.session = session or requests.Session()

    def get_finished_matches(self, competition_code: str, season: int | None = None) -> list[MatchResult]:
        """Resultados finalizados de una competición (ej. 'PL', 'PD', 'SA'), opcionalmente de una temporada."""
        params = {"status": "FINISHED"}
        if season is not None:
            params["season"] = season
        resp = self.session.get(
            f"{BASE_URL}/competitions/{competition_code}/matches",
            headers={"X-Auth-Token": self.api_key},
            params=params,
        )
        resp.raise_for_status()
        return [
            MatchResult(
                home_team=m["homeTeam"]["name"],
                away_team=m["awayTeam"]["name"],
                home_goals=m["score"]["fullTime"]["home"],
                away_goals=m["score"]["fullTime"]["away"],
            )
            for m in resp.json().get("matches", [])
            if m["score"]["fullTime"]["home"] is not None
        ]
