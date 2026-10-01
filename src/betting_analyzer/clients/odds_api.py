"""Cliente para The Odds API (https://the-odds-api.com), usado para traer cuotas en vivo."""

from __future__ import annotations

from dataclasses import dataclass

import requests

from betting_analyzer.config import MissingApiKeyError, get_settings

BASE_URL = "https://api.the-odds-api.com/v4"


@dataclass(frozen=True)
class OutcomeOdds:
    name: str
    price: float


@dataclass(frozen=True)
class BookmakerOdds:
    bookmaker: str
    outcomes: list[OutcomeOdds]


@dataclass(frozen=True)
class MatchOdds:
    event_id: str
    home_team: str
    away_team: str
    commence_time: str
    bookmakers: list[BookmakerOdds]

    def best_price(self, outcome_name: str) -> float | None:
        """Mejor cuota disponible entre casas para un resultado dado."""
        prices = [
            outcome.price
            for bookmaker in self.bookmakers
            for outcome in bookmaker.outcomes
            if outcome.name == outcome_name
        ]
        return max(prices) if prices else None


class OddsApiClient:
    def __init__(self, api_key: str | None = None, session: requests.Session | None = None):
        self.api_key = api_key or get_settings().odds_api_key
        if not self.api_key:
            raise MissingApiKeyError(
                "Falta ODDS_API_KEY. Configúrala en .env o como variable de entorno. "
                "Obtén una clave gratuita en https://the-odds-api.com"
            )
        self.session = session or requests.Session()

    def list_sports(self) -> list[dict]:
        resp = self.session.get(f"{BASE_URL}/sports", params={"apiKey": self.api_key})
        resp.raise_for_status()
        return resp.json()

    def get_h2h_odds(
        self,
        sport_key: str,
        regions: str = "eu",
        odds_format: str = "decimal",
    ) -> list[MatchOdds]:
        """Cuotas 1X2 (head-to-head) para los próximos partidos de un deporte/liga.

        sport_key sigue la convención de la API, ej. "soccer_epl", "soccer_spain_la_liga".
        """
        resp = self.session.get(
            f"{BASE_URL}/sports/{sport_key}/odds",
            params={
                "apiKey": self.api_key,
                "regions": regions,
                "markets": "h2h",
                "oddsFormat": odds_format,
            },
        )
        resp.raise_for_status()
        return [_parse_match(event) for event in resp.json()]


def _parse_match(event: dict) -> MatchOdds:
    bookmakers = [
        BookmakerOdds(
            bookmaker=bk["title"],
            outcomes=[
                OutcomeOdds(name=o["name"], price=float(o["price"]))
                for market in bk["markets"]
                if market["key"] == "h2h"
                for o in market["outcomes"]
            ],
        )
        for bk in event.get("bookmakers", [])
    ]
    return MatchOdds(
        event_id=event["id"],
        home_team=event["home_team"],
        away_team=event["away_team"],
        commence_time=event["commence_time"],
        bookmakers=bookmakers,
    )
