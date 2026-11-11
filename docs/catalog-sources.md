# Źródła katalogu i cen — rozpoznanie 2026-11-03

## Wynik

Nie potwierdzono źródła, które jednocześnie zapewnia darmowy, ogólnodostępny dostęp bez akceptacji partnera, szeroki katalog części PC, aktualne ceny polskich sklepów i walutę PLN. Dostępność dokumentacji nie oznacza przyznanego dostępu do danych. Żadnego konta dostawcy ani płatnego zasobu nie utworzono.

| Źródło | Co potwierdzono | Przydatność dla PCMaker |
| --- | --- | --- |
| [UserBenchmark CSV](https://www.userbenchmark.com/page/developer) | Bezpośredni plik CPU został odczytany. Nagłówek zawiera dane modeli i benchmarków, bez ceny, waluty, sklepu ani daty ceny. Strona opisowa wymagała CAPTCHA. | Import modeli, nie dostawca ofert PLN. |
| [Ceneo — program partnerski](https://pp.ceneo.pl/api) | Klucz jest przyznawany partnerom; do ubiegania się o testowy dostęp wymagana jest działająca witryna kierująca ruch do Ceneo. | Kandydat do polskich cen po uzyskaniu dostępu i sprawdzeniu zakresu danych. Nie jest obecnie podłączony. |
| [Allegro — oficjalny komunikat](https://github.com/allegro/allegro-api/issues/4566) | Produkcyjny `GET /offers/listing` wymaga zweryfikowanej aplikacji. | Sama rejestracja aplikacji nie wystarcza do porównywania cudzych ofert. |
| [everydata — Alternate](https://everydata.io/apis/alternate) | Dostawca deklaruje aktualne dane alternate.de i plan 100 zapytań miesięcznie bez karty; dokumentowany przykład używa EUR. Usługa zewnętrzna, w wersji beta. | Darmowy limit testowy istnieje, ale dotyczy niemieckiego sklepu. Nie zastępuje polskich ofert ani ciągłej synchronizacji większego katalogu. Nie testowano wywołania z kluczem. |
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

## Rozszerzenie zaakceptowane przez użytkownika

Do ofert przyjęto Alternate przez everydata.io i stały kurs 1 EUR = 4,30 PLN, konfigurowany na serwerze. Bez zewnętrznego API kursów. GUI ma zawierać tylko informację, że cena jest orientacyjna i może się różnić. Oryginalna kwota EUR, kurs i źródło pozostają częścią danych technicznych, aby wycenę można było odtworzyć.

Klucz everydata.io nie został jeszcze uzyskany. Integrację można zweryfikować na kontrolowanych odpowiedziach, ale nie potwierdza to działania konta dostawcy ani rzeczywistych ofert. Aktualny kontrakt wyszukiwania i szczegółów potwierdzono w publicznej [specyfikacji OpenAPI](https://api.everydata.io/openapi.json), wskazanej przez [interaktywną dokumentację](https://everydata.io/docs). Wyszukiwanie może zwracać przybliżone dopasowania; jego wyników nie należy automatycznie przypisywać do modeli katalogu jako dokładnych wycen.
