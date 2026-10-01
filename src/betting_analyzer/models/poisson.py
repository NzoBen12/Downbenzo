"""Modelo de Poisson para predecir resultados de fútbol a partir de históricos de goles.

Idea del modelo (variante simplificada de Dixon-Coles):
  - Cada equipo tiene una fuerza de ataque y una de defensa, relativas al promedio de la liga.
  - Los goles esperados de local/visitante se obtienen combinando esas fuerzas con los
    promedios de goles de local/visitante de la liga.
  - Los goles de cada equipo se modelan como variables de Poisson independientes, lo que da
    una matriz de probabilidades de marcador exacto, de la que se derivan 1X2, over/under, etc.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.stats import poisson

from betting_analyzer.types import MatchResult

MAX_GOALS = 10


@dataclass(frozen=True)
class TeamStrength:
    attack: float
    defense: float


@dataclass(frozen=True)
class LeagueRatings:
    avg_home_goals: float
    avg_away_goals: float
    teams: dict[str, TeamStrength] = field(default_factory=dict)

    def strength_for(self, team: str) -> TeamStrength:
        if team not in self.teams:
            raise KeyError(
                f"No hay historial para el equipo '{team}'. "
                "Revisa el nombre exacto o añade más partidos históricos."
            )
        return self.teams[team]


def build_league_ratings(matches: list[MatchResult]) -> LeagueRatings:
    """Calcula fuerzas de ataque/defensa de cada equipo a partir de resultados históricos."""
    if not matches:
        raise ValueError("Se necesita al menos un partido histórico para construir ratings.")

    teams = sorted({m.home_team for m in matches} | {m.away_team for m in matches})
    n_matches = len(matches)

    avg_home_goals = sum(m.home_goals for m in matches) / n_matches
    avg_away_goals = sum(m.away_goals for m in matches) / n_matches

    strengths: dict[str, TeamStrength] = {}
    for team in teams:
        home_matches = [m for m in matches if m.home_team == team]
        away_matches = [m for m in matches if m.away_team == team]

        home_scored = sum(m.home_goals for m in home_matches)
        home_conceded = sum(m.away_goals for m in home_matches)
        away_scored = sum(m.away_goals for m in away_matches)
        away_conceded = sum(m.home_goals for m in away_matches)

        games_home = len(home_matches) or 1
        games_away = len(away_matches) or 1

        # Fuerza de ataque/defensa relativa al promedio de la liga (1.0 = promedio).
        attack_home = (home_scored / games_home) / avg_home_goals if avg_home_goals else 1.0
        attack_away = (away_scored / games_away) / avg_away_goals if avg_away_goals else 1.0
        defense_home = (home_conceded / games_home) / avg_away_goals if avg_away_goals else 1.0
        defense_away = (away_conceded / games_away) / avg_home_goals if avg_home_goals else 1.0

        strengths[team] = TeamStrength(
            attack=(attack_home + attack_away) / 2,
            defense=(defense_home + defense_away) / 2,
        )

    return LeagueRatings(avg_home_goals=avg_home_goals, avg_away_goals=avg_away_goals, teams=strengths)


@dataclass(frozen=True)
class MatchPrediction:
    home_team: str
    away_team: str
    expected_home_goals: float
    expected_away_goals: float
    score_matrix: np.ndarray  # score_matrix[i, j] = P(home marca i, away marca j)

    @property
    def home_win_prob(self) -> float:
        return float(np.sum(np.tril(self.score_matrix, -1)))

    @property
    def draw_prob(self) -> float:
        return float(np.sum(np.diag(self.score_matrix)))

    @property
    def away_win_prob(self) -> float:
        return float(np.sum(np.triu(self.score_matrix, 1)))

    def over_under_prob(self, line: float) -> tuple[float, float]:
        """Probabilidad de over/under de goles totales para una línea (ej. 2.5)."""
        totals = np.add.outer(np.arange(self.score_matrix.shape[0]), np.arange(self.score_matrix.shape[1]))
        over = float(np.sum(self.score_matrix[totals > line]))
        under = float(np.sum(self.score_matrix[totals < line]))
        return over, under


def predict_match(ratings: LeagueRatings, home_team: str, away_team: str) -> MatchPrediction:
    home = ratings.strength_for(home_team)
    away = ratings.strength_for(away_team)

    expected_home_goals = home.attack * away.defense * ratings.avg_home_goals
    expected_away_goals = away.attack * home.defense * ratings.avg_away_goals

    home_probs = poisson.pmf(np.arange(MAX_GOALS + 1), expected_home_goals)
    away_probs = poisson.pmf(np.arange(MAX_GOALS + 1), expected_away_goals)
    score_matrix = np.outer(home_probs, away_probs)
    score_matrix /= score_matrix.sum()  # normaliza (la cola truncada en MAX_GOALS pierde masa mínima)

    return MatchPrediction(
        home_team=home_team,
        away_team=away_team,
        expected_home_goals=expected_home_goals,
        expected_away_goals=expected_away_goals,
        score_matrix=score_matrix,
    )
