# Sofia Police Map

Find the police station and the local precinct inspector for any address in Sofia.

**[georgi-i.github.io/sofia-police-map](https://georgi-i.github.io/sofia-police-map/)**

## Features

- Tap the map, search an address or use your location to see the responsible police station (РУ)
- All 153 precincts of the 9 Sofia stations: inspectors, boundaries, reception address, phone and hours
- Probable precinct suggested from the street or neighbourhood name
- District outlines shown instantly, no waiting on external services
- Shareable links: `#42.66852,23.36157` for a location, `#ru-07` for a station
- Light and dark mode, works on phones

The suggested precinct is approximate. Always check the boundaries in its description.

## Structure

```
index.html            page
assets/styles.css     styles
assets/app.js         map, search and matching logic
data/police-data.js   stations and precincts
data/districts.js     district boundaries
```

Plain HTML, CSS and JavaScript with no build step. Built with [Leaflet](https://leafletjs.com), [OpenStreetMap](https://www.openstreetmap.org) and [Nominatim](https://nominatim.org).

## Data

- Stations and precincts: [СДВР](https://www.mvr.bg/sdvr/дирекцията/за-одмвр/структура), 2026 lists, fetched 8 Nov 2026
- District boundaries: OpenStreetMap contributors

## License

[GPL-3.0](LICENSE)

---

Made for my wife Desislava.
