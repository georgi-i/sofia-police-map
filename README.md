# 🚔 Sofia Police Map

An interactive web application that helps residents of Sofia, Bulgaria find their local police station based on their address or location.

## 🌐 Live Demo

[View the map](https://georgi-i.github.io/sofia-police-map/index.html)

## ✨ Features

- **Interactive map** – tap anywhere to see which police station (РУ) serves that place; the administrative district is outlined on the map
- **Address search** and **“my location”**
- **Precinct inspectors** – all 153 precincts from the 25 “Териториална полиция” groups of the 9 Sofia police stations: inspectors, boundaries, reception address, phone and hours
- **Probable precinct** – picked automatically from the street / neighbourhood name (approximate, always check the boundaries)
- **Shareable links** – `#42.66852,23.36157` opens a location, `#ru-07` opens a station
- Minimal, Apple-style UI with automatic dark mode and a bottom sheet on phones

## 🎯 Purpose

This tool helps Sofia residents quickly identify which police station serves their area, making it easier to:
- Report incidents to the correct jurisdiction
- Contact local police authorities
- Understand police service area boundaries
- Find the nearest police station

## 🛠️ Technologies Used

- Plain HTML / CSS / JavaScript – no build step
- [Leaflet](https://leafletjs.com) with OpenStreetMap tiles
- [Nominatim](https://nominatim.org) for geocoding, [Overpass API](https://overpass-api.de) for district boundaries

## 📁 Structure

```
index.html            page shell
assets/styles.css     UI styles (light + dark)
assets/app.js         map, search and matching logic
data/police-data.js   stations + precincts (generated from the СДВР PDF lists on mvr.bg)
```

Data source: [СДВР – структура](https://www.mvr.bg/sdvr/дирекцията/за-одмвр/структура), lists for 2026 (fetched 8 Nov 2026).

## 🚀 Usage

1. Visit the [live application](https://georgi-i.github.io/sofia-police-map/index.html)
2. Either:
   - Click directly on the map at your location
   - Enter your address in the search box
3. View the police station information for your area


## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 📧 Contact

For questions or suggestions, please open an issue in this repository.

## 🙏 Acknowledgments

- Model anthropic/claude-sonnet-4.5 [VS Code, Cline, 11 Oct 2025 vibe coding project]
- Map data from [OpenStreetMap](https://www.openstreetmap.org) contributors

---

Made with ❤️ for my wife Desislava
