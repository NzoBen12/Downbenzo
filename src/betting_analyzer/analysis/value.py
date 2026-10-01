"""Comparación de probabilidades del modelo contra cuotas de casas de apuestas (value bets).

Las cuotas de una casa incluyen margen (overround): la suma de las probabilidades implícitas
de todos los resultados es mayor a 1. Antes de comparar contra el modelo, se "desviga"
(normaliza) para obtener la probabilidad implícita justa de cada resultado.
"""

from __future__ import annotations

from dataclasses import dataclass


def implied_probability(decimal_odds: float) -> float:
    if decimal_odds <= 1:
        raise ValueError("Las cuotas decimales deben ser mayores a 1.")
    return 1.0 / decimal_odds


def remove_overround(implied_probs: dict[str, float]) -> dict[str, float]:
    """Normaliza probabilidades implícitas para que sumen 1 (quita el margen de la casa)."""
    total = sum(implied_probs.values())
    if total <= 0:
        raise ValueError("La suma de probabilidades implícitas debe ser positiva.")
    return {outcome: prob / total for outcome, prob in implied_probs.items()}


def expected_value(model_prob: float, decimal_odds: float, stake: float = 1.0) -> float:
    """Valor esperado de apostar `stake` a una cuota decimal, según la probabilidad del modelo."""
    win_return = stake * (decimal_odds - 1)
    lose_return = -stake
    return model_prob * win_return + (1 - model_prob) * lose_return


@dataclass(frozen=True)
class ValueBet:
    outcome: str
    model_prob: float
    fair_implied_prob: float
    decimal_odds: float
    edge: float  # model_prob - fair_implied_prob
    expected_value: float  # EV por unidad apostada


def find_value_bets(
    model_probs: dict[str, float],
    market_odds: dict[str, float],
    min_edge: float = 0.0,
) -> list[ValueBet]:
    """Compara probabilidades del modelo contra cuotas de mercado y señala apuestas con valor.

    model_probs: ej. {"home": 0.45, "draw": 0.28, "away": 0.27} (deben sumar ~1)
    market_odds: cuotas decimales de la casa para los mismos resultados, ej. {"home": 2.3, ...}
    min_edge: edge mínimo (model_prob - fair_implied_prob) para considerar la apuesta "de valor".
    """
    fair_probs = remove_overround({o: implied_probability(odds) for o, odds in market_odds.items()})

    value_bets = []
    for outcome, odds in market_odds.items():
        if outcome not in model_probs:
            continue
        model_prob = model_probs[outcome]
        edge = model_prob - fair_probs[outcome]
        if edge > min_edge:
            value_bets.append(
                ValueBet(
                    outcome=outcome,
                    model_prob=model_prob,
                    fair_implied_prob=fair_probs[outcome],
                    decimal_odds=odds,
                    edge=edge,
                    expected_value=expected_value(model_prob, odds),
                )
            )
    return sorted(value_bets, key=lambda vb: vb.edge, reverse=True)
