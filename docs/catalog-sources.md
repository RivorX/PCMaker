# Źródła katalogu i cen — rozpoznanie 2026-11-03

## Wynik

Nie potwierdzono źródła, które jednocześnie zapewnia darmowy, ogólnodostępny dostęp bez akceptacji partnera, szeroki katalog części PC, aktualne ceny polskich sklepów i walutę PLN. Dostępność dokumentacji nie oznacza przyznanego dostępu do danych. Żadnego konta dostawcy ani płatnego zasobu nie utworzono.

| Źródło | Co potwierdzono | Przydatność dla PCMaker |
| --- | --- | --- |
| [UserBenchmark CSV](https://www.userbenchmark.com/page/developer) | Bezpośredni plik CPU został odczytany. Nagłówek zawiera dane modeli i benchmarków, bez ceny, waluty, sklepu ani daty ceny. Strona opisowa wymagała CAPTCHA. | Import modeli, nie dostawca ofert PLN. |
| [Ceneo — program partnerski](https://pp.ceneo.pl/api) | Klucz jest przyznawany partnerom; do ubiegania się o testowy dostęp wymagana jest działająca witryna kierująca ruch do Ceneo. | Kandydat do polskich cen po uzyskaniu dostępu i sprawdzeniu zakresu danych. Nie jest obecnie podłączony. |
| [Allegro — oficjalny komunikat](https://github.com/allegro/allegro-api/issues/4566) | Produkcyjny `GET /offers/listing` wymaga zweryfikowanej aplikacji. | Sama rejestracja aplikacji nie wystarcza do porównywania cudzych ofert. |
| [docyx/pc-part-dataset](https://github.com/docyx/pc-part-dataset) | Repozytorium publikuje CSV/JSON dla wielu kategorii i podaje aktualizację 2025-07-23; [opis danych](https://github.com/docyx/pc-part-dataset/blob/main/API.md) określa ceny jako USD. | Alternatywny statyczny katalog, nie API bieżących cen PLN. Nie importowano danych z tego źródła. |

## Potwierdzony format UserBenchmark

Odczytano publiczny plik [CPU_UserBenchmarks.csv](https://www.userbenchmark.com/resources/download/csv/CPU_UserBenchmarks.csv). Nagłówek:

```csv
Type,Part Number,Brand,Model,Rank,Benchmark,Samples,URL
```

`Part Number` identyfikuje wariant producenta, `URL` pozwala zachować odnośnik do rekordu dostawcy. `Rank`, `Benchmark` i `Samples` dotyczą danych tego dostawcy; nie wolno zamieniać ich na uniwersalny wynik wydajności, przewidywane FPS ani porównywać bezpośrednio między kategoriami. W pliku nie ma socketu, wymiarów, złączy czy kompletnej specyfikacji kompatybilności. Nie wyprowadzamy takich cech z samej nazwy modelu.

Importer powinien pracować na lokalnym pobranym pliku, zachować źródło i czas importu oraz odrzucać błędne rekordy. Czas importu nie jest datą aktualizacji danych przez dostawcę. Nie sprawdzono kompletności pozostałych kategorii ani gwarantowanej częstotliwości aktualizacji. Warunki dalszej publikacji pełnego zbioru wymagają potwierdzenia u dostawcy; nie dołączamy całego zewnętrznego zbioru do repozytorium. Małe dane przykładowe aplikacji są oznaczone oddzielnie.

## Decyzja dla pierwszej wersji katalogu

Wdrażamy katalog modeli, przykładowe rekordy i odczyt REST. Import CSV jest operacją administracyjną wykonywaną lokalnie, bez połączeń z UserBenchmark podczas każdego żądania użytkownika. Brak ceny jest reprezentowany przez `null`, nigdy przez `0 PLN`.

Model bazy rozdziela komponent, specyfikacje, identyfikator w źródle, ofertę sklepu i historię ceny. Przed synchronizacją ofert potrzebne są: dostęp dostawcy, identyfikacja produktu po MPN/EAN, waluta, dostępność, koszt dostawy oraz czas obserwacji. Harmonogram odświeżania musi respektować limity przyznanego dostępu. Bez źródła ceny nie są automatycznie aktualizowane; nie ma deklaracji „na żywo”.

## Odrzucone źródło ofert

Everydata/Alternate zostało rozpoznane, ale odrzucone z powodu ograniczenia do ofert alternate.de i warunków B2B. Nie jest już źródłem aplikacji, nie ma fallbacku ani aktywnego klucza w konfiguracji.

## Zmiana dostawcy na SerpApi — 2026-11-11

Po stwierdzeniu ograniczenia poprzedniego dostawcy do przedsiębiorców, również w darmowym planie, użytkowniczka założyła konto SerpApi i zapisała lokalny klucz `SERPAPI_API_KEY`. Nowym źródłem ofert jest Google Shopping przez [SerpApi](https://serpapi.com/google-shopping-api). Nie ma automatycznego powrotu do odrzuconego źródła. Ceny PLN pochodzące z wyników nie wymagają przeliczania EUR.

Zweryfikowano jedno rzeczywiste wyszukiwanie `AMD Ryzen 7 7800X3D` z `engine=google_shopping`, `gl=pl`, `hl=pl`, `google_domain=google.pl`: HTTP 200, status `Success`, 40 pozycji w `shopping_results`. Kwota występuje jako polski tekst `price` z oznaczeniem `zł` oraz liczba `extracted_price`. Nie było osobnego pola waluty. Nazwa sklepu pochodzi z `source`; zwracany `product_link` prowadzi do strony produktu Google, niekoniecznie bezpośrednio do sklepu. Klucz i surowe metadane odpowiedzi nie były publikowane ani zapisywane w repozytorium.

Wyniki zawierają również całe komputery, zestawy oraz inne modele procesorów niż wpisany. Filtrowanie oczywistych zestawów w kontekście procesora jest heurystyką, nie dowodem zgodności konkretnego wariantu. Zapisany katalog modeli i znalezione oferty pozostają odrębne, a wybór oferty jest ręczny. Pobieranie jest inicjowane przez użytkownika i buforowane w celu ograniczenia liczby wywołań.
