# Data sources

| Source | Use | Terms |
|---|---|---|
| FAA NAS Status, https://nasstatus.faa.gov/api/airport-status-information | Ground delays, ground stops, arrival/departure delays | US government public data |
| NWS api.weather.gov (`/stations/KORD/observations/latest`, `/alerts/active?point=`) | Weather now, active alerts | US government public data; User-Agent with contact required |
| Aviation Weather Center, https://aviationweather.gov/data/api/ | METAR, TAF | US government public data; 100 requests/min limit |
| OpenStreetMap via Overpass API | Roads, runways, traffic signals for the simulated route and map | ODbL 1.0, © OpenStreetMap contributors |
| Sample flights (`lib/samples.js`) | Flight rows | Generated; fictional airlines and codes |

Licensed flight data (AeroDataBox, AviationStack) is **not used**: their adapters are disabled stubs.
Showing flight data on public screens needs written display rights from the provider.
