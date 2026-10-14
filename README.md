# El-Iseo – demo konfiguratora 3D

Interaktywny model motorówki w stylu Riva El-Iseo (LOA 8,35 m, szerokość 2,5 m) w przeglądarce:
obracanie i zoom, kolor kadłuba, kolor tapicerki, bimini, gotowe widoki kamery (3/4, bok, góra, rufa, kokpit).
Wybrana konfiguracja zapisuje się w adresie strony (np. `#c=1&u=3`), więc można ją udostępnić linkiem.

Realizm: fizycznie liczone niebo (model Preethama) z chmurami, odległe wzgórza z perspektywą powietrzną,
woda z lustrzanymi odbiciami i prawdziwą mapą normalnych fal (`assets/waternormals.jpg` z repozytorium three.js),
cień jachtu na wodzie, okluzja otoczenia (GTAO), bloom, tone mapping ACES, lakier metaliczny z drobinkami
pod lakierem bezbarwnym, faktura skóry i tkaniny. Na telefonach ciężkie efekty (GTAO, MSAA) są wyłączane.
Parametry światła można stroić w adresie: `?az=110&el=30&sun=22&exp=0.34`.

Model jest w całości generowany kodem (Three.js) na podstawie planu pokładu i rysunku bocznego:
jedna ciągła powierzchnia kadłuba z zaokrągloną krawędzią pokładu i kokpitem, mahoniowy pokład z jasnymi fugami,
przyciemniana szyba-kopuła, chromowany odbojnik i przetłoczenie na burcie, platforma rufowa z teakiem,
wnętrze kokpitu (sofy, deska rozdzielcza, kierownica). Woda ma lustrzane odbicia, niebo jest generowane shaderem.

## Uruchomienie (konfigurator jest w `demo/el-iseo/`)

Strona wymaga lokalnego serwera HTTP (moduły ES nie działają z `file://`):

- `npx serve` (Node.js), albo
- `python -m http.server 8000` / `py -m http.server 8000` (Python), albo
- rozszerzenie **Live Server** w VS Code → „Open with Live Server” na `index.html`.

Nie trzeba nic instalować ani budować — Three.js jest w katalogu `vendor/`.

## Struktura

- `index.html` – układ strony i interfejs
- `main.js` – model jachtu, scena, woda i niebo, konfigurator
- `vendor/` – Three.js r160 (+ OrbitControls, RoundedBoxGeometry, Reflector, post-processing, Sky z dodanymi chmurami)
- `assets/` – tekstura normalnych fal
