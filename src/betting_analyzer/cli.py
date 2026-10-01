"""CLI del analizador de apuestas.

IMPORTANTE (plan Free de API-Football, confirmado en vivo):
  - Solo da acceso a temporadas 2022-2024, nunca a la temporada en curso.
  - El endpoint de cuotas (/odds) devuelve 0 resultados siempre, incluso en Premier League.
  Conclusión: con este plan NO se pueden traer próximos partidos reales ni cuotas reales, así
  que `analyze`/`focus` (pensados para eso) no van a encontrar nada útil por ahora. Lo que sí
  funciona hoy es `predict`: predicción Poisson de un enfrentamiento hipotético entre dos
  equipos de una liga, usando sus históricos 2022-2024 como base.

Flujo recomendado mientras el plan sea Free:
  1. `leagues --country X` para encontrar el league_id de una liga en API-Football.
  2. `predict --league-id ID --season 2023 --home "Equipo A" --away "Equipo B"` para ver las
     probabilidades 1X2 y los goles esperados de ese enfrentamiento.

Flujo original (cuando haya un plan con temporada actual + cuotas):
  `analyze --league-id ID --season YYYY` y `focus` comparan la predicción contra cuotas reales
  de los próximos partidos y señalan value bets.
"""

from __future__ import annotations

import click

from betting_analyzer.analysis.value import find_value_bets
from betting_analyzer.clients.api_football import ApiFootballClient
from betting_analyzer.leagues import FOCUS_LEAGUES
from betting_analyzer.models.poisson import build_league_ratings, predict_match


@click.group()
def main() -> None:
    """Analizador de apuestas: predicción Poisson + detección de value bets, vía API-Football."""


@main.command("leagues")
@click.option("--country", required=True, help="Nombre de país tal como lo reconoce API-Football (ej. 'Norway', 'Kenya').")
def list_leagues(country: str) -> None:
    """Busca ligas/copas de un país en API-Football, con su league_id y temporada actual."""
    for league in ApiFootballClient().search_leagues(country):
        season = league.current_season if league.current_season is not None else "?"
        click.echo(f"id={league.league_id:<6} season={season!s:<6} [{league.league_type}] {league.name} ({league.country})")


@main.command("predict")
@click.option("--league-id", type=int, required=True, help="league_id de API-Football (ver comando 'leagues').")
@click.option("--season", type=int, required=True, help="Temporada de históricos a usar (2022-2024 en el plan Free).")
@click.option("--home", required=True, help="Nombre del equipo local, tal como aparece en API-Football.")
@click.option("--away", required=True, help="Nombre del equipo visitante, tal como aparece en API-Football.")
def predict(league_id: int, season: int, home: str, away: str) -> None:
    """Predice un enfrentamiento hipotético entre dos equipos usando sus históricos de una liga/temporada."""
    client = ApiFootballClient()
    click.echo(f"Descargando históricos de league_id={league_id}, season={season}...")
    matches = client.get_finished_fixtures(league_id, season)
    if not matches:
        click.echo("Sin partidos finalizados para esta liga/temporada.")
        return
    click.echo(f"  {len(matches)} partidos finalizados. Construyendo ratings...")
    ratings = build_league_ratings(matches)

    try:
        prediction = predict_match(ratings, home, away)
    except KeyError as exc:
        click.echo(f"\n{exc}")
        teams = ", ".join(sorted(ratings.teams))
        click.echo(f"\nEquipos disponibles en esta liga/temporada:\n  {teams}")
        return

    click.echo(f"\n{home} vs {away}")
    click.echo(
        f"  Modelo -> local {prediction.home_win_prob:.1%} | empate {prediction.draw_prob:.1%} | "
        f"visita {prediction.away_win_prob:.1%}  "
        f"(xG: {prediction.expected_home_goals:.2f} - {prediction.expected_away_goals:.2f})"
    )
    over, under = prediction.over_under_prob(2.5)
    click.echo(f"  Over/Under 2.5 goles -> over {over:.1%} | under {under:.1%}")


@main.command("analyze")
@click.option("--league-id", type=int, required=True, help="league_id de API-Football (ver comando 'leagues').")
@click.option("--season", type=int, required=True, help="Temporada (ej. 2024).")
@click.option("--min-edge", type=float, default=0.02, help="Edge mínimo para marcar una apuesta como 'de valor'.")
def analyze(league_id: int, season: int, min_edge: float) -> None:
    """Predice próximos partidos de una liga y señala value bets comparando contra cuotas reales."""
    client = ApiFootballClient()
    _analyze_league(client, league_id=league_id, season=season, min_edge=min_edge, label=f"league_id={league_id}")


@main.command("focus")
def focus() -> None:
    """Construye ratings para todas las ligas configuradas en leagues.py y lista sus equipos.

    Con el plan Free (sin temporada actual ni cuotas) esto es lo útil hoy: confirma que cada
    liga foco tiene históricos reales y deja los equipos listos para usar con `predict`.
    """
    client = ApiFootballClient()
    pending = [fl for fl in FOCUS_LEAGUES if fl.league_id is None]
    for fl in pending:
        click.echo(f"[omitido] {fl.label}: falta configurar league_id/season (usa 'leagues --country {fl.country}').")

    for fl in FOCUS_LEAGUES:
        if fl.league_id is None or fl.season is None:
            continue
        click.echo(f"\n=== {fl.label} (league_id={fl.league_id}, season={fl.season}) ===")
        matches = client.get_finished_fixtures(fl.league_id, fl.season)
        if not matches:
            click.echo("  Sin partidos finalizados. Nada que construir.")
            continue
        ratings = build_league_ratings(matches)
        click.echo(f"  {len(matches)} partidos, {len(ratings.teams)} equipos:")
        click.echo(f"  {', '.join(sorted(ratings.teams))}")


def _analyze_league(client: ApiFootballClient, *, league_id: int, season: int, min_edge: float, label: str) -> None:
    click.echo(f"Descargando históricos de '{label}' (league_id={league_id}, season={season})...")
    matches = client.get_finished_fixtures(league_id, season)
    if not matches:
        click.echo("  Sin partidos finalizados para esta liga/temporada. Nada que analizar.")
        return
    click.echo(f"  {len(matches)} partidos finalizados encontrados. Construyendo ratings...")
    ratings = build_league_ratings(matches)

    upcoming = client.get_h2h_odds(league_id, season)
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
        # API-Football usa "Home"/"Draw"/"Away" como nombres de resultado en el mercado Match Winner.
        market_odds = {
            "home": event.best_price("Home"),
            "draw": event.best_price("Draw"),
            "away": event.best_price("Away"),
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

    if not any_analyzed and upcoming:
        click.echo(
            "\nNingún partido pudo analizarse: los equipos de los próximos partidos no tienen "
            "historial en los partidos finalizados descargados."
        )


if __name__ == "__main__":
    main()
