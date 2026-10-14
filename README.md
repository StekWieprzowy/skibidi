# Banat Studios — strona + dema konfiguratorów 3D

Statyczna strona (HTML/CSS/JS, bez budowania) z działającymi konfiguratorami 3D na pierwszym ekranie.

## Struktura

- `index.html`, `assets/` — strona studia (PL/EN, czcionki Archivo + IBM Plex Mono hostowane lokalnie, licencja OFL)
- `contact.php` — wysyłka formularza e-mailem (hosting z PHP, np. home.pl). Ustaw adresy `TO` i `FROM` na górze pliku.
  Bez PHP formularz otwiera program pocztowy (mailto).
- `demo/` — konfiguratory 3D (Three.js r160 w `demo/vendor/`):
  - `el-iseo/` — jacht motorowy (runabout)
  - `car/` — GT coupé w studiu
  - `camper/` — kamper van w plenerze
  - `sauna/` — sauna beczka
  - `common/` — wspólny silnik scen (`stage.js`), panel opcji (`ui.js`), style
- Dema przyjmują parametry: `?embed` (tryb osadzenia na stronie), `?lang=en`, `?nopanel`.
  Konfiguracja zapisuje się w hashu adresu, np. `demo/car/#p=1&r=2&c=1`.

## Uruchomienie lokalnie

```
npx serve        # albo: python -m http.server 8000
```

## Wdrożenie na home.pl

Wgraj przez FTP całą zawartość (index.html, assets/, demo/, contact.php) do katalogu domeny.
