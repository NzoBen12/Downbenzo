# Downbenzo — Analizador de apuestas

Predice resultados de fútbol con un modelo de Poisson (ataque/defensa por equipo, al estilo
Dixon-Coles simplificado) a partir de resultados históricos. El objetivo final es compararlo
contra cuotas reales para señalar **value bets** (ver "Estado actual" abajo: esa parte todavía
no funciona con el plan gratuito de API-Football).

Enfocado en ligas que las APIs "estándar" (football-data.org, The Odds API) no cubren bien:
segundas/terceras divisiones de Noruega, Grecia e Italia, y las ligas principales de Kenia,
Panamá e Israel. Por eso usa **API-Football** (api-football.com / api-sports.io) como único
proveedor de datos: sí tiene estas 9-10 ligas en su catálogo con históricos ricos (200-390
partidos por liga en 2023), a diferencia de football-data.org (12 ligas top en el free tier, y
ni Noruega/Grecia en divisiones bajas ni Kenia/Panamá/Israel existen en su catálogo a ningún
precio).

## Estado actual (confirmado en vivo contra API-Football, plan Free)

- ✅ **Históricos**: funcionan bien para las 9-10 ligas foco. Cientos de partidos por liga.
- ❌ **Temporada actual**: el plan Free solo da acceso a las temporadas 2022-2024, nunca a la
  temporada en curso. No hay forma de traer los próximos partidos reales con este plan.
- ❌ **Cuotas**: el endpoint `/odds` devuelve 0 resultados siempre en el plan Free, incluso para
  Premier League (se probó explícitamente). No es un problema de ligas nicho: las cuotas
  simplemente no están disponibles sin un plan de pago.

Mientras esto no cambie, el flujo útil es **predicción de enfrentamientos hipotéticos** entre
dos equipos de una liga (comando `predict`), no un comparador de value bets en vivo. El código
de `analyze`/`focus` para comparar contra cuotas reales de próximos partidos queda listo en el
repo para cuando haya un plan que dé temporada actual + cuotas.

## Cómo funciona

1. **Descubrimiento** → `betting-analyzer leagues --country "Norway"` busca en API-Football el
   `league_id` y la temporada actual de las ligas de un país.
2. **Históricos** → con un `league_id`/`season` (usa 2023 o 2024 en el plan Free), se descargan
   los partidos finalizados y se calcula la fuerza de ataque y defensa de cada equipo relativa
   al promedio de la liga.
3. **Modelo** → con esas fuerzas se estiman los goles esperados (xG) de local y visitante en un
   partido, y se construye una matriz de probabilidades de marcador exacto (Poisson), de la que
   salen las probabilidades de 1X2 y over/under.
4. **Cuotas y value bets** (necesita un plan de pago, ver "Estado actual") → se descargarían las
   cuotas 1X2 de los próximos partidos, se "desvigarían" (quitar el margen de la casa) y se
   compararían contra la probabilidad del modelo para señalar apuestas con `edge > 0`.

## Instalación

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Copia `.env.example` a `.env` y pon tu clave de API-Football (plan gratuito: 100
peticiones/día, temporadas 2022-2024 solamente):

```bash
cp .env.example .env
# editar .env con API_FOOTBALL_KEY y API_FOOTBALL_PROVIDER (direct o rapidapi)
```

## Uso

**Encontrar el `league_id` real de una liga** (los IDs no son públicos/estables, hay que
consultarlos en vivo):

```bash
betting-analyzer leagues --country "Norway"
betting-analyzer leagues --country "Italy"
betting-analyzer leagues --country "Kenya"
```

**Predecir un enfrentamiento hipotético** (lo que sí funciona hoy en el plan Free):

```bash
betting-analyzer predict --league-id 104 --season 2023 --home "Equipo A" --away "Equipo B"
```

Si no sabes los nombres exactos de los equipos, corre el comando igual: si no encuentra alguno
de los dos, te lista todos los equipos disponibles en esa liga/temporada.

**Ver todas las ligas foco de una vez** (construye ratings y lista equipos de cada una):

```bash
betting-analyzer focus
```

**Cuando haya un plan con temporada actual + cuotas** — comparación completa con value bets:

```bash
betting-analyzer analyze --league-id 104 --season 2024 --min-edge 0.02
```

## Ligas foco configuradas

`src/betting_analyzer/leagues.py` lista 10 ligas con `league_id`/`season` reales, confirmados
en vivo: Noruega (1. Division y 2. Division Grupo 1), Grecia (Super League 2 y Gamma Ethniki
Grupo 1), Italia (Serie B y Serie C Girone A), Kenia (Super League, la aproximación más cercana
a 2ª división que tiene el catálogo), Panamá (LPF — único nivel que existe para este país en
API-Football) e Israel (Liga Leumit y Liga Alef). El archivo documenta estos casos especiales en
su docstring.

## Limitaciones conocidas

- **Plan gratuito = sin temporada actual ni cuotas** (ver "Estado actual" arriba). Para un
  comparador de value bets en vivo real hace falta subir de plan en api-football.com, o sumar
  un proveedor de cuotas aparte (ej. The Odds API) y aceptar que cubra solo algunas de estas
  ligas nicho.
- **100 peticiones/día**: cada liga analizada gasta al menos 1-2 peticiones. La cuenta usada
  para validar este proyecto fue suspendida automáticamente por el proveedor tras una ráfaga de
  pruebas (no por superar las 100/día) — si ves `"access": "Your account is suspended"`, revisa
  el estado en dashboard.api-football.com antes de reintentar.
- Noruega 3ª división y Grecia 3ª división están repartidas en varios grupos regionales (6 y 10
  respectivamente); solo se configuró el grupo 1 de cada una como muestra representativa.
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
  cli.py                    # comandos de línea de comandos (leagues, predict, focus, analyze)
tests/                      # tests unitarios (sin llamadas de red)
```
