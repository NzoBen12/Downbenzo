"""Tipos de datos compartidos entre clientes de API, el modelo y el análisis."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MatchResult:
    home_team: str
    away_team: str
    home_goals: int
    away_goals: int


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
