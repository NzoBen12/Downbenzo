"""CLI del analizador de apuestas.

Flujo típico:
  1. Trae resultados históricos de una competición (football-data.org) y construye ratings.
  2. Trae cuotas en vivo de los próximos partidos (the-odds-api.com).
  3. Para cada partido con cuotas y datos históricos de ambos equipos, predice 1X2 con Poisson
     y lo compara contra las cuotas para señalar value bets.
"""

from __future__ import annotations

import click

from betting_analyzer.analysis.value import find_value_bets
from betting_analyzer.clients.football_data import FootballDataClient
from betting_analyzer.clients.odds_api import OddsApiClient
from betting_analyzer.models.poisson import build_league_ratings, predict_match


@click.group()
def main() -> None:
    """Analizador de apuestas: predicción Poisson + detección de value bets."""


@main.command("sports")
def list_sports() -> None:
    """Lista los deportes/ligas disponibles en The Odds API."""
    client = OddsApiClient()
    for sport in client.list_sports():
        click.echo(f"{sport['key']:35s} {sport['title']}")


@main.command("analyze")
@click.option("--competition", required=True, help="Código de competición en football-data.org (ej. PL, PD, SA).")
@click.option("--sport-key", required=True, help="Clave de deporte/liga en The Odds API (ej. soccer_epl).")
@click.option("--season", type=int, default=None, help="Temporada para los históricos (ej. 2023).")
@click.option("--min-edge", type=float, default=0.02, help="Edge mínimo para marcar una apuesta como 'de valor'.")
def analyze(competition: str, sport_key: str, season: int | None, min_edge: float) -> None:
    """Predice próximos partidos y señala value bets comparando contra cuotas reales."""
    click.echo(f"Descargando históricos de '{competition}'...")
    matches = FootballDataClient().get_finished_matches(competition, season=season)
    click.echo(f"  {len(matches)} partidos finalizados encontrados. Construyendo ratings...")
    ratings = build_league_ratings(matches)

    click.echo(f"Descargando cuotas en vivo de '{sport_key}'...")
    upcoming = OddsApiClient().get_h2h_odds(sport_key)
    click.echo(f"  {len(upcoming)} próximos partidos con cuotas.")

    any_analyzed = False
    for event in upcoming:
        try:
            prediction = predict_match(ratings, event.home_team, event.away_team)
        except KeyError as exc:
            click.echo(f"\n[omitido] {event.home_team} vs {event.away_team}: {exc}")
            continue

        any_analyzed = True
        model_probs = {
            "home": prediction.home_win_prob,
            "draw": prediction.draw_prob,
            "away": prediction.away_win_prob,
        }
        market_odds = {
            "home": event.best_price(event.home_team),
            "away": event.best_price(event.away_team),
            "draw": event.best_price("Draw"),
        }
        market_odds = {k: v for k, v in market_odds.items() if v is not None}

        click.echo(f"\n{event.home_team} vs {event.away_team} ({event.commence_time})")
        click.echo(
            f"  Modelo -> local {model_probs['home']:.1%} | empate {model_probs['draw']:.1%} | "
            f"visita {model_probs['away']:.1%}  "
            f"(xG: {prediction.expected_home_goals:.2f} - {prediction.expected_away_goals:.2f})"
        )

        value_bets = find_value_bets(model_probs, market_odds, min_edge=min_edge)
        if not value_bets:
            click.echo("  Sin value bets por encima del edge mínimo.")
        for vb in value_bets:
            click.echo(
                f"  >> VALUE: {vb.outcome:5s} cuota {vb.decimal_odds:.2f}  "
                f"modelo {vb.model_prob:.1%} vs implícita {vb.fair_implied_prob:.1%}  "
                f"edge +{vb.edge:.1%}  EV/unidad {vb.expected_value:+.3f}"
            )

    if not any_analyzed:
        click.echo(
            "\nNingún partido pudo analizarse: revisa que los nombres de equipo de "
            "football-data.org y The Odds API coincidan para esta liga."
        )


if __name__ == "__main__":
    main()
