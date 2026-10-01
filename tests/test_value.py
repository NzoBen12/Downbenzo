import pytest

from betting_analyzer.analysis.value import (
    expected_value,
    find_value_bets,
    implied_probability,
    remove_overround,
)


def test_implied_probability():
    assert implied_probability(2.0) == pytest.approx(0.5)
    assert implied_probability(4.0) == pytest.approx(0.25)


def test_implied_probability_rejects_invalid_odds():
    with pytest.raises(ValueError):
        implied_probability(1.0)


def test_remove_overround_normalizes_to_one():
    # Cuotas tipicas con margen: 1/2.0 + 1/3.5 + 1/4.0 > 1
    implied = {
        "home": implied_probability(2.0),
        "draw": implied_probability(3.5),
        "away": implied_probability(4.0),
    }
    fair = remove_overround(implied)
    assert sum(fair.values()) == pytest.approx(1.0)
    # El orden relativo de probabilidades se conserva.
    assert fair["home"] > fair["draw"] > fair["away"]


def test_expected_value_positive_when_model_prob_exceeds_breakeven():
    # Cuota 3.0 implica 33.3% breakeven; si el modelo cree 45%, EV debe ser positivo.
    ev = expected_value(model_prob=0.45, decimal_odds=3.0)
    assert ev > 0


def test_expected_value_negative_when_model_prob_below_breakeven():
    ev = expected_value(model_prob=0.20, decimal_odds=3.0)
    assert ev < 0


def test_find_value_bets_flags_only_positive_edge():
    model_probs = {"home": 0.50, "draw": 0.25, "away": 0.25}
    market_odds = {"home": 2.5, "draw": 3.0, "away": 10.0}  # home es claramente infravalorado
    bets = find_value_bets(model_probs, market_odds, min_edge=0.0)
    outcomes = {b.outcome for b in bets}
    assert "home" in outcomes
    # La lista debe estar ordenada por edge descendente.
    assert bets == sorted(bets, key=lambda b: b.edge, reverse=True)


def test_find_value_bets_respects_min_edge_threshold():
    model_probs = {"home": 0.34, "draw": 0.33, "away": 0.33}
    market_odds = {"home": 3.0, "draw": 3.0, "away": 3.0}  # cuotas ~justas, sin margen
    bets = find_value_bets(model_probs, market_odds, min_edge=0.05)
    assert bets == []
