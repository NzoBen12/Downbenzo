# Downbenzo — Analizador de apuestas

Predice resultados de fútbol con un modelo de Poisson (ataque/defensa por equipo, al estilo
Dixon-Coles simplificado) a partir de resultados históricos, y lo compara contra cuotas reales
de casas de apuestas para señalar **value bets** (apuestas con valor esperado positivo).

## Cómo funciona

1. **Históricos** → [football-data.org](https://www.football-data.org) da los resultados
   finalizados de una competición. Con ellos se calcula la fuerza de ataque y defensa de cada
   equipo relativa al promedio de la liga.
2. **Modelo** → con esas fuerzas se estiman los goles esperados (xG) de local y visitante en un
   partido, y se construye una matriz de probabilidades de marcador exacto (Poisson), de la que
   salen las probabilidades de 1X2 y over/under.
3. **Cuotas** → [the-odds-api.com](https://the-odds-api.com) da las cuotas en vivo de los
   próximos partidos.
4. **Value bets** → se "desviga" la cuota de la casa (se le quita el margen) para obtener su
   probabilidad implícita justa, y se compara contra la probabilidad del modelo. Si el modelo
   cree que un resultado es más probable de lo que la cuota implica, hay valor (`edge > 0`).

## Instalación

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Copia `.env.example` a `.env` y pon tus claves (ambos servicios tienen plan gratuito):

```bash
cp .env.example .env
# editar .env con ODDS_API_KEY y FOOTBALL_DATA_API_KEY
```

## Uso

Ver ligas/deportes disponibles en The Odds API:

```bash
betting-analyzer sports
```

Analizar una liga (predicción + value bets):

```bash
betting-analyzer analyze --competition PL --sport-key soccer_epl --season 2023
```

- `--competition`: código de football-data.org (`PL` Premier League, `PD` LaLiga, `SA` Serie A, ...)
- `--sport-key`: clave de The Odds API (`soccer_epl`, `soccer_spain_la_liga`, ...)
- `--min-edge`: edge mínimo para marcar una apuesta como "de valor" (por defecto 0.02 = 2 puntos porcentuales)

## Limitaciones conocidas

- **Nombres de equipo**: football-data.org y The Odds API pueden nombrar al mismo equipo de
  forma distinta (ej. "Manchester United FC" vs "Manchester United"). Si un partido se omite en
  el análisis, es probable que sea por esto — se puede resolver con un mapeo manual de nombres.
- El modelo de Poisson es intencionalmente simple (no incluye forma reciente, lesiones, ventaja
  de localía ajustada por Dixon-Coles, etc.). Es un punto de partida razonable, no un sistema de
  predicción de nivel profesional.

## Desarrollo

```bash
pytest
```

## Estructura

```
src/betting_analyzer/
  clients/        # integraciones con APIs externas (cuotas, históricos)
  models/         # modelo de Poisson (ratings + predicción)
  analysis/       # cálculo de probabilidad implícita y value bets
  cli.py          # comandos de línea de comandos
tests/            # tests unitarios (sin llamadas de red)
```
