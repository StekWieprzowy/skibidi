# Skibidi 27 – demo konfiguratora jachtu 3D

Interaktywny model motorówki (8,35 m) w przeglądarce: obracanie, zoom, zmiana koloru kadłuba, widoki kamery, bimini wł./wył.
Model jest generowany kodem (Three.js), bez plików modeli i bez budowania projektu.

## Uruchomienie

```
python3 -m http.server 8000
```

i otwórz http://localhost:8000. Strona wymaga serwera HTTP (moduły ES nie działają z `file://`).

## Struktura

- `index.html` – układ strony i interfejs
- `main.js` – scena, woda/niebo (shadery), model jachtu, konfigurator
- `vendor/` – Three.js r160 i OrbitControls (lokalnie, działa offline)
