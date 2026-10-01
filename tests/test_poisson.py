import pytest

from betting_analyzer.clients.football_data import MatchResult
from betting_analyzer.models.poisson import build_league_ratings, predict_match


def _sample_matches() -> list[MatchResult]:
    # Liga de 3 equipos, A es claramente más fuerte que B y C.
    return [
        MatchResult("A", "B", 3, 0),
        MatchResult("B", "A", 0, 2),
        MatchResult("A", "C", 2, 1),
        MatchResult("C", "A", 1, 3),
        MatchResult("B", "C", 1, 1),
        MatchResult("C", "B", 0, 0),
    ]


def test_build_league_ratings_computes_league_averages():
    ratings = build_league_ratings(_sample_matches())
    # Promedio de goles de local/visitante sobre los 6 partidos de la muestra.
    assert ratings.avg_home_goals == pytest.approx((3 + 0 + 2 + 1 + 1 + 0) / 6)
    assert ratings.avg_away_goals == pytest.approx((0 + 2 + 1 + 3 + 1 + 0) / 6)
    assert set(ratings.teams) == {"A", "B", "C"}


def test_build_league_ratings_requires_matches():
    with pytest.raises(ValueError):
        build_league_ratings([])


def test_strength_for_unknown_team_raises():
    ratings = build_league_ratings(_sample_matches())
    with pytest.raises(KeyError):
        ratings.strength_for("Equipo inexistente")


def test_predict_match_probabilities_sum_to_one():
    ratings = build_league_ratings(_sample_matches())
    prediction = predict_match(ratings, "A", "B")
    total = prediction.home_win_prob + prediction.draw_prob + prediction.away_win_prob
    assert total == pytest.approx(1.0, abs=1e-6)


def test_predict_match_favors_stronger_team():
    ratings = build_league_ratings(_sample_matches())
    prediction = predict_match(ratings, "A", "C")
    assert prediction.home_win_prob > prediction.away_win_prob
    assert prediction.expected_home_goals > prediction.expected_away_goals


def test_over_under_prob_sums_close_to_total_minus_exact_line():
    ratings = build_league_ratings(_sample_matches())
    prediction = predict_match(ratings, "A", "B")
    over, under = prediction.over_under_prob(2.5)
    assert over + under == pytest.approx(1.0, abs=1e-6)
    assert over > 0 and under > 0
