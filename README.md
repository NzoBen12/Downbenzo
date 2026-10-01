# Downbenzo — Analizador de apuestas

Predice resultados de fútbol con un modelo de Poisson (ataque/defensa por equipo, al estilo
Dixon-Coles simplificado) a partir de resultados históricos, y lo compara contra cuotas reales
de casas de apuestas para señalar **value bets** (apuestas con valor esperado positivo).

Enfocado en ligas que las APIs "estándar" (football-data.org, The Odds API) no cubren bien:
segundas/terceras divisiones de Noruega, Grecia e Italia, y las ligas principales de Kenia,
Panamá e Israel. Por eso usa **API-Football** (api-football.com / api-sports.io) como único
proveedor de datos: dice cubrir miles de ligas en su plan gratuito, a diferencia de
football-data.org (12 ligas top en el free tier, y ni Noruega/Grecia en divisiones bajas ni
Kenia/Panamá/Israel existen en su catálogo a ningún precio).

## Cómo funciona

1. **Descubrimiento** → `betting-analyzer leagues --country "Norway"` busca en API-Football el
   `league_id` y la temporada actual de las ligas de un país.
2. **Históricos** → con un `league_id`/`season`, se descargan los partidos finalizados y se
   calcula la fuerza de ataque y defensa de cada equipo relativa al promedio de la liga.
3. **Modelo** → con esas fuerzas se estiman los goles esperados (xG) de local y visitante en un
   partido, y se construye una matriz de probabilidades de marcador exacto (Poisson), de la que
   salen las probabilidades de 1X2 y over/under.
4. **Cuotas** → se descargan las cuotas 1X2 de los próximos partidos de la misma liga, desde la
   misma API.
5. **Value bets** → se "desviga" la cuota (se le quita el margen de la casa) para obtener su
   probabilidad implícita justa, y se compara contra la probabilidad del modelo. Si el modelo
   cree que un resultado es más probable de lo que la cuota implica, hay valor (`edge > 0`).

## Instalación

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Copia `.env.example` a `.env` y pon tu clave de API-Football (tiene plan gratuito, 100
peticiones/día):

```bash
cp .env.example .env
# editar .env con API_FOOTBALL_KEY y API_FOOTBALL_PROVIDER (direct o rapidapi)
```

## Uso

**Paso 1 — encontrar el `league_id` real de una liga** (los IDs no son públicos/estables, hay
que consultarlos en vivo):

```bash
betting-analyzer leagues --country "Norway"
betting-analyzer leagues --country "Italy"
betting-analyzer leagues --country "Kenya"
```

**Paso 2 — analizar esa liga** (predicción + value bets):

```bash
betting-analyzer analyze --league-id 103 --season 2024
```

**Alternativa — analizar todas las ligas foco de una vez**: completa los `league_id`/`season`
reales en `src/betting_analyzer/leagues.py` (vienen como placeholders `None` hasta que los
confirmes con el comando `leagues`) y corre:

```bash
betting-analyzer focus
```

- `--min-edge`: edge mínimo para marcar una apuesta como "de valor" (por defecto 0.02 = 2 puntos
  porcentuales)

## Ligas foco configuradas

`src/betting_analyzer/leagues.py` lista las ligas objetivo: Noruega (1ª y 2ª división detrás de
la top, es decir 2. y 3. divisjon), Grecia (Super League 2 y Gamma Ethniki), Italia (Serie B y
Serie C), Kenia (Premier League), Panamá (LPF) e Israel (Ligat Ha'Al/Liga Leumit). Sus
`league_id`/`season` están sin confirmar (`None`) — rellénalos con lo que devuelva el comando
`leagues` antes de usar `focus`.

## Limitaciones conocidas

- **Cobertura real sin validar**: la estructura de las respuestas de API-Football (`/leagues`,
  `/fixtures`, `/odds`) sigue su documentación pública, pero no se ha probado todavía contra la
  API en vivo con una clave real. Antes de confiar en los resultados, corre `leagues` para cada
  país y confirma que existen datos históricos y cuotas suficientes — en ligas muy pequeñas la
  cobertura de API-Football suele ser más pobre que en las ligas top (menos partidos, menos
  casas de apuestas con cuotas).
- **Plan gratuito**: 100 peticiones/día. Cada `analyze`/`focus` gasta varias peticiones
  (históricos + próximos partidos + páginas de cuotas), así que con varias ligas foco el límite
  diario se puede agotar rápido.
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
  clients/api_football.py  # integración con API-Football (históricos + cuotas)
  types.py                 # tipos compartidos (MatchResult, MatchOdds, ...)
  models/                  # modelo de Poisson (ratings + predicción)
  analysis/                # cálculo de probabilidad implícita y value bets
  leagues.py                # ligas foco configuradas (país, league_id, season)
  cli.py                    # comandos de línea de comandos
tests/                      # tests unitarios (sin llamadas de red)
```
