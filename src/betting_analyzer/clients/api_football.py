"""Cliente para API-Football (https://www.api-football.com / api-sports.io).

Proveedor único para históricos de partidos y cuotas, elegido porque cubre miles de ligas
(incluidas divisiones menores y países fuera de las "cinco grandes" europeas), a diferencia de
football-data.org (solo ligas top) o The Odds API (cobertura de ligas nicho sin confirmar).

Soporta las dos formas de autenticarse:
  - "direct": clave de https://dashboard.api-football.com, header 'x-apisports-key'.
  - "rapidapi": clave de RapidAPI, headers 'x-rapidapi-key' / 'x-rapidapi-host'.

Nota: la estructura de las respuestas sigue la documentación pública de API-Football v3, pero
no ha sido validada todavía contra la API en vivo con una clave real (ver README: hay que
confirmar con `betting-analyzer leagues --country ...` qué ligas/temporadas existen de verdad
antes de usarlas en producción).
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

from betting_analyzer.config import MissingApiKeyError, get_settings
from betting_analyzer.types import BookmakerOdds, MatchOdds, MatchResult, OutcomeOdds

DIRECT_BASE_URL = "https://v3.football.api-sports.io"
RAPIDAPI_BASE_URL = "https://api-football-v1.p.rapidapi.com/v3"
RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com"

MATCH_WINNER_BET_ID = 1  # mercado "Match Winner" (1X2) en el catálogo de apuestas de la API
FINISHED_STATUS = "FT"  # "Match Finished" en fixture.status.short


@dataclass(frozen=True)
class LeagueInfo:
    league_id: int
    name: str
    league_type: str
    country: str
    current_season: int | None


@dataclass(frozen=True)
class UpcomingFixture:
    fixture_id: int
    home_team: str
    away_team: str
    commence_time: str


class ApiFootballClient:
    def __init__(self, api_key: str | None = None, provider: str | None = None, session: requests.Session | None = None):
        settings = get_settings()
        self.api_key = api_key or settings.api_football_key
        self.provider = provider or settings.api_football_provider
        if not self.api_key:
            raise MissingApiKeyError(
                "Falta API_FOOTBALL_KEY. Configúrala en .env o como variable de entorno. "
                "Obtén una clave gratuita en https://dashboard.api-football.com o vía RapidAPI."
            )
        self.session = session or requests.Session()

    @property
    def _base_url(self) -> str:
        return RAPIDAPI_BASE_URL if self.provider == "rapidapi" else DIRECT_BASE_URL

    @property
    def _headers(self) -> dict[str, str]:
        if self.provider == "rapidapi":
            return {"x-rapidapi-key": self.api_key, "x-rapidapi-host": RAPIDAPI_HOST}
        return {"x-apisports-key": self.api_key}

    def _get(self, path: str, params: dict) -> list[dict]:
        resp = self.session.get(f"{self._base_url}{path}", headers=self._headers, params=params)
        resp.raise_for_status()
        payload = resp.json()
        errors = payload.get("errors")
        if errors:
            raise RuntimeError(f"API-Football devolvió errores para {path}: {errors}")
        return payload.get("response", [])

    def search_leagues(self, country: str) -> list[LeagueInfo]:
        """Busca ligas/copas por nombre de país (ej. 'Norway', 'Kenya', 'Panama')."""
        leagues = []
        for item in self._get("/leagues", {"country": country}):
            league = item["league"]
            country_name = item["country"]["name"]
            current_season = next(
                (s["year"] for s in item.get("seasons", []) if s.get("current")),
                None,
            )
            leagues.append(
                LeagueInfo(
                    league_id=league["id"],
                    name=league["name"],
                    league_type=league["type"],
                    country=country_name,
                    current_season=current_season,
                )
            )
        return leagues

    def get_finished_fixtures(self, league_id: int, season: int) -> list[MatchResult]:
        """Resultados finalizados de una liga/temporada (para construir ratings de Poisson)."""
        fixtures = self._get("/fixtures", {"league": league_id, "season": season, "status": FINISHED_STATUS})
        return [
            MatchResult(
                home_team=f["teams"]["home"]["name"],
                away_team=f["teams"]["away"]["name"],
                home_goals=f["goals"]["home"],
                away_goals=f["goals"]["away"],
            )
            for f in fixtures
            if f["goals"]["home"] is not None and f["goals"]["away"] is not None
        ]

    def get_upcoming_fixtures(self, league_id: int, season: int) -> list[UpcomingFixture]:
        """Próximos partidos (no comenzados) de una liga/temporada."""
        fixtures = self._get("/fixtures", {"league": league_id, "season": season, "status": "NS"})
        return [
            UpcomingFixture(
                fixture_id=f["fixture"]["id"],
                home_team=f["teams"]["home"]["name"],
                away_team=f["teams"]["away"]["name"],
                commence_time=f["fixture"]["date"],
            )
            for f in fixtures
        ]

    def get_h2h_odds(self, league_id: int, season: int) -> list[MatchOdds]:
        """Cuotas 1X2 de los próximos partidos de una liga/temporada.

        Junta /odds (cuotas por fixture_id) con /fixtures (nombres de equipo) porque la
        respuesta de /odds no incluye los nombres de los equipos, solo el id del partido.
        """
        upcoming = {f.fixture_id: f for f in self.get_upcoming_fixtures(league_id, season)}
        if not upcoming:
            return []

        odds_by_fixture: dict[int, list[BookmakerOdds]] = {}
        page = 1
        while True:
            response = self._get(
                "/odds",
                {"league": league_id, "season": season, "bet": MATCH_WINNER_BET_ID, "page": page},
            )
            if not response:
                break
            for entry in response:
                fixture_id = entry["fixture"]["id"]
                if fixture_id not in upcoming:
                    continue
                bookmakers = [_parse_bookmaker(bk) for bk in entry.get("bookmakers", [])]
                odds_by_fixture[fixture_id] = [b for b in bookmakers if b is not None]
            if len(response) < 10:  # la API pagina de 10 en 10
                break
            page += 1

        return [
            MatchOdds(
                event_id=str(fixture_id),
                home_team=upcoming[fixture_id].home_team,
                away_team=upcoming[fixture_id].away_team,
                commence_time=upcoming[fixture_id].commence_time,
                bookmakers=bookmakers,
            )
            for fixture_id, bookmakers in odds_by_fixture.items()
        ]


def _parse_bookmaker(bookmaker: dict) -> BookmakerOdds | None:
    match_winner_bet = next((bet for bet in bookmaker.get("bets", []) if bet["id"] == MATCH_WINNER_BET_ID), None)
    if match_winner_bet is None:
        return None
    return BookmakerOdds(
        bookmaker=bookmaker["name"],
        outcomes=[
            OutcomeOdds(name=value["value"], price=float(value["odd"]))
            for value in match_winner_bet["values"]
        ],
    )
