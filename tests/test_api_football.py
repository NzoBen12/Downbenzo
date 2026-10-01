"""Tests del parseo de respuestas de API-Football, con un session falso (sin red)."""

from __future__ import annotations

from betting_analyzer.clients.api_football import ApiFootballClient


class FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._payload


class FakeSession:
    """Devuelve una respuesta canned según el path de la request, ignorando los params."""

    def __init__(self, responses_by_path: dict[str, list[dict] | list[list[dict]]]):
        self._responses_by_path = responses_by_path
        self._call_counts: dict[str, int] = {}
        self.requests: list[tuple[str, dict]] = []

    def get(self, url: str, headers: dict, params: dict) -> FakeResponse:
        self.requests.append((url, params))
        for path, response in self._responses_by_path.items():
            if url.endswith(path):
                if response and isinstance(response[0], list):
                    # secuencia de páginas: una lista por llamada
                    call_index = self._call_counts.get(path, 0)
                    self._call_counts[path] = call_index + 1
                    page = response[call_index] if call_index < len(response) else []
                    return FakeResponse({"response": page})
                return FakeResponse({"response": response})
        raise AssertionError(f"No hay respuesta falsa configurada para {url}")


def _client(responses_by_path: dict) -> ApiFootballClient:
    return ApiFootballClient(api_key="fake-key", provider="direct", session=FakeSession(responses_by_path))


def test_search_leagues_parses_id_name_and_current_season():
    client = _client(
        {
            "/leagues": [
                {
                    "league": {"id": 103, "name": "Eliteserien", "type": "League"},
                    "country": {"name": "Norway"},
                    "seasons": [
                        {"year": 2023, "current": False},
                        {"year": 2024, "current": True},
                    ],
                }
            ]
        }
    )
    leagues = client.search_leagues("Norway")
    assert len(leagues) == 1
    league = leagues[0]
    assert league.league_id == 103
    assert league.name == "Eliteserien"
    assert league.country == "Norway"
    assert league.current_season == 2024


def test_get_finished_fixtures_filters_out_matches_without_score():
    client = _client(
        {
            "/fixtures": [
                {
                    "teams": {"home": {"name": "A"}, "away": {"name": "B"}},
                    "goals": {"home": 2, "away": 1},
                },
                {
                    "teams": {"home": {"name": "C"}, "away": {"name": "D"}},
                    "goals": {"home": None, "away": None},
                },
            ]
        }
    )
    results = client.get_finished_fixtures(league_id=1, season=2024)
    assert len(results) == 1
    assert results[0].home_team == "A"
    assert results[0].home_goals == 2


def test_get_h2h_odds_joins_odds_with_upcoming_fixture_team_names():
    client = _client(
        {
            "/fixtures": [
                {
                    "fixture": {"id": 555, "date": "2024-05-01T18:00:00Z"},
                    "teams": {"home": {"name": "A"}, "away": {"name": "B"}},
                }
            ],
            "/odds": [
                [
                    {
                        "fixture": {"id": 555},
                        "bookmakers": [
                            {
                                "name": "Bet365",
                                "bets": [
                                    {
                                        "id": 1,
                                        "values": [
                                            {"value": "Home", "odd": "2.10"},
                                            {"value": "Draw", "odd": "3.40"},
                                            {"value": "Away", "odd": "3.20"},
                                        ],
                                    }
                                ],
                            }
                        ],
                    }
                ]
            ],
        }
    )
    match_odds = client.get_h2h_odds(league_id=1, season=2024)
    assert len(match_odds) == 1
    event = match_odds[0]
    assert event.home_team == "A"
    assert event.away_team == "B"
    assert event.best_price("Home") == 2.10
    assert event.best_price("Draw") == 3.40
