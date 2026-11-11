"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogComponent, CatalogListResponse, ComponentCategory } from "@/types/catalog";
import type { AlternateOffer, AlternateSearchCandidate, OffersErrorResponse, OffersLookupResponse, OffersSearchResponse } from "@/types/offers";

const categoryLabels: Record<ComponentCategory, string> = {
  cpu: "Procesory",
  gpu: "Karty graficzne",
  motherboard: "Płyty główne",
  memory: "Pamięci RAM",
  storage: "Dyski",
  psu: "Zasilacze",
  case: "Obudowy",
  cooling: "Chłodzenia",
};

const categories = Object.keys(categoryLabels) as ComponentCategory[];

export default function Catalog() {
  const [items, setItems] = useState<CatalogComponent[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ComponentCategory | "">("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CatalogComponent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<CatalogListResponse["meta"]["source"]>("sample");
  const [provider, setProvider] = useState<string | undefined>();
  const [offerId, setOfferId] = useState("");
  const [offer, setOffer] = useState<AlternateOffer | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerKeyword, setOfferKeyword] = useState("");
  const [offerCandidates, setOfferCandidates] = useState<AlternateSearchCandidate[]>([]);
  const [offerSearchLoading, setOfferSearchLoading] = useState(false);
  const [offerSearchMeta, setOfferSearchMeta] = useState<OffersSearchResponse["meta"] | null>(null);
  const [offerSearchError, setOfferSearchError] = useState<string | null>(null);
  const limit = 6;

  const lookupOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedId = offerId.trim();
    if (!/^\d{1,40}$/.test(normalizedId)) {
      setOffer(null);
      setOfferError("Podaj liczbowy identyfikator produktu Alternate.");
      return;
    }
    setOfferLoading(true);
    setOfferError(null);
    try {
      const response = await fetch(`/api/v1/offers?action=lookup&productId=${encodeURIComponent(normalizedId)}`);
      const body = await response.json() as OffersLookupResponse | OffersErrorResponse;
      if (!response.ok || !("data" in body)) {
        throw new Error("message" in body ? body.message : "Nie udało się pobrać oferty.");
      }
      setOffer(body.data);
    } catch (reason: unknown) {
      setOffer(null);
      setOfferError(reason instanceof Error ? reason.message : "Nie udało się pobrać oferty.");
    } finally {
      setOfferLoading(false);
    }
  };

  const searchOffers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedKeyword = offerKeyword.trim();
    if (!normalizedKeyword || normalizedKeyword.length > 120) {
      setOfferSearchError("Podaj nazwę produktu od 1 do 120 znaków.");
      return;
    }
    setOfferSearchLoading(true);
    setOfferSearchError(null);
    try {
      const response = await fetch(`/api/v1/offers?action=search&keyword=${encodeURIComponent(normalizedKeyword)}&page=1&sortBy=relevance`);
      const body = await response.json() as OffersSearchResponse | OffersErrorResponse;
      if (!response.ok || !("data" in body) || !Array.isArray(body.data)) {
        throw new Error("message" in body ? body.message : "Nie udało się wyszukać ofert.");
      }
      setOfferCandidates(body.data);
      setOfferSearchMeta(body.meta);
    } catch (reason: unknown) {
      setOfferCandidates([]);
      setOfferSearchMeta(null);
      setOfferSearchError(reason instanceof Error ? reason.message : "Nie udało się wyszukać ofert.");
    } finally {
      setOfferSearchLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    setLoading(true);
    fetch(`/api/v1/components?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as CatalogListResponse & { message?: string };
        if (!response.ok) throw new Error(body.message ?? "Nie udało się pobrać katalogu.");
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setItems(body.data);
        setTotal(body.meta.total);
        setSource(body.meta.source);
        setProvider(body.meta.provider);
        setSelected(null);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Nie udało się pobrać katalogu.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, page, query]);

  const pages = Math.max(1, Math.ceil(total / limit));
  const sourceLabel = useMemo(() => {
    if (source === "external") return provider ? `snapshot · ${provider}` : "snapshot zewnętrzny";
    if (source === "database") return "baza danych";
    return "zbiór demonstracyjny";
  }, [provider, source]);

  return (
    <div className="page-stack">
      <section className="page-heading split-heading">
        <div>
          <p className="eyebrow">KATALOG / ETAP 02</p>
          <h1>Znajdź podzespół</h1>
          <p className="lede">Przeglądaj modele, które mogą zasilić konfigurator. Ceny pojawią się po podłączeniu źródła bieżących ofert.</p>
        </div>
        <span className="catalog-source-badge"><span className="status-dot" /> {sourceLabel}</span>
      </section>
      <section className="catalog-toolbar card">
        <label className="catalog-search">Szukaj<input value={query} placeholder="np. Ryzen, DDR5, RTX..." onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
        <label>Kategoria<select value={category} onChange={(event) => { setCategory(event.target.value as ComponentCategory | ""); setPage(1); }}><option value="">Wszystkie kategorie</option>{categories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
        <div className="catalog-count"><strong>{total}</strong><span>rekordów</span></div>
      </section>
      <div className="catalog-layout">
        <section className="catalog-results">
          {loading && <div className="card catalog-message">Ładowanie katalogu…</div>}
          {error && <div className="card catalog-message error" role="alert">{error}</div>}
          {!loading && !error && items.length === 0 && <div className="card catalog-message">Nie znaleziono podzespołów dla tych filtrów.</div>}
          {!loading && !error && items.map((item) => <button className={`catalog-item card ${selected?.id === item.id ? "selected" : ""}`} key={item.id} type="button" onClick={() => setSelected(item)}><span className="catalog-type-icon">{item.category.slice(0, 3).toUpperCase()}</span><span className="catalog-item-copy"><strong>{item.name}</strong><small>{categoryLabels[item.category]} · {item.manufacturer}</small><span className="catalog-specs">{Object.entries(item.specifications).slice(0, 3).map(([key, value]) => <em key={key}>{key}: {value}</em>)}</span></span><span className="catalog-price">{item.price === null ? "brak ceny" : `${item.price.toFixed(2)} ${item.currency}`}<small>źródło: {item.source.kind}</small></span></button>)}
          <div className="catalog-pagination"><button className="text-button" disabled={page <= 1} type="button" onClick={() => setPage((value) => value - 1)}>← Poprzednia</button><span>Strona {page} z {pages}</span><button className="text-button" disabled={page >= pages} type="button" onClick={() => setPage((value) => value + 1)}>Następna →</button></div>
        </section>
        <aside className="catalog-detail card">{selected ? <><span className="section-kicker">SZCZEGÓŁY REKORDU</span><h2>{selected.name}</h2><p className="catalog-detail-description">{selected.description}</p><dl>{Object.entries(selected.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className="catalog-detail-note"><strong>Cena niedostępna</strong><span>To opis katalogowy bez aktualnej oferty sklepu. Nie traktujemy tego rekordu jako wyceny zestawu.</span></div></> : <><span className="section-kicker">SZCZEGÓŁY REKORDU</span><h2>Wybierz element</h2><p className="catalog-detail-description">Kliknij rekord, aby zobaczyć znane specyfikacje i pochodzenie danych.</p><div className="catalog-detail-empty">Ceny i dostępność zostaną dodane osobnym adapterem ofert.</div></>}</aside>
      </div>
      <section className="offer-lookup card">
        <div>
          <span className="section-kicker">OFERTA / ALTERNATE</span>
          <h2>Porównaj oferty</h2>
          <p className="catalog-detail-description">Wyszukaj produkt, wybierz konkretną ofertę, a potem sprawdź jej szczegóły. Wynik nie jest automatycznie przypisywany do podobnego modelu katalogowego.</p>
        </div>
        <form className="offer-lookup-form" onSubmit={searchOffers}>
          <label>Szukaj oferty<input value={offerKeyword} placeholder="np. RTX 4070, SSD 512 GB" onChange={(event) => setOfferKeyword(event.target.value)} /></label>
          <button className="button primary" type="submit" disabled={offerSearchLoading}>{offerSearchLoading ? "Szukam…" : "Szukaj ofert"}</button>
          {selected && <button className="button secondary" type="button" onClick={() => setOfferKeyword(selected.name)}>Użyj nazwy modelu</button>}
        </form>
        {offerSearchError && <div className="catalog-message error" role="alert">{offerSearchError}</div>}
        {offerSearchMeta && <div className="offer-search-meta">Znaleziono {offerSearchMeta.resultCount} ofert · strona {offerSearchMeta.page} z {offerSearchMeta.lastPage ?? "?"}</div>}
        {offerCandidates.length > 0 && <div className="offer-candidates">{offerCandidates.map((candidate) => <article className="offer-candidate" key={`${candidate.providerProductId}-${candidate.sourceUrl ?? "offer"}`}><div><strong>{candidate.productTitle}</strong><small>{candidate.manufacturer ?? "Producent nieznany"} · {candidate.deliveryMessage ?? "Dostępność nieznana"}</small>{candidate.productRating && <small>ocena: {candidate.productRating}</small>}</div><div className="offer-candidate-actions"><span className="offer-result-price">{candidate.price.estimatedPLN ? `${(candidate.price.estimatedPLN.amountCents / 100).toFixed(2)} PLN` : "Cena niedostępna"}<small>Cena orientacyjna, może się różnić</small></span><button className="text-button" type="button" onClick={() => setOfferId(candidate.providerProductId)}>Wybierz</button>{candidate.sourceUrl && <a className="text-button" href={candidate.sourceUrl} target="_blank" rel="noreferrer">Sklep ↗</a>}</div></article>)}</div>}
        <div className="offer-lookup-divider" />
        <div>
          <h3>Sprawdź konkretny produkt</h3>
          <p className="catalog-detail-description">Wpisz identyfikator z dostawcy albo wybierz ofertę powyżej.</p>
        </div>
        <form className="offer-lookup-form" onSubmit={lookupOffer}>
          <label>Identyfikator produktu<input value={offerId} inputMode="numeric" placeholder="np. 1108895" onChange={(event) => setOfferId(event.target.value)} /></label>
          <button className="button primary" type="submit" disabled={offerLoading}>{offerLoading ? "Sprawdzam…" : "Sprawdź ofertę"}</button>
        </form>
        {offerError && <div className="catalog-message error" role="alert">{offerError}</div>}
        {offer && <div className="offer-result">
          <div><strong>{offer.productTitle}</strong><small>{offer.manufacturer ?? "Producent nieznany"} · źródło: Alternate</small></div>
          <div className="offer-result-price">{offer.price.estimatedPLN ? `${(offer.price.estimatedPLN.amountCents / 100).toFixed(2)} PLN` : "Cena niedostępna"}<small>Cena orientacyjna, może się różnić</small></div>
          <dl><div><dt>Dostępność</dt><dd>{offer.available === true ? "dostępny" : offer.available === false ? "niedostępny" : "nieznana"}</dd></div>{offer.shipping.estimatedPLN && <div><dt>Dostawa</dt><dd><span>{(offer.shipping.estimatedPLN.amountCents / 100).toFixed(2)} PLN</span><small>Cena orientacyjna, może się różnić</small></dd></div>}</dl>
        </div>}
      </section>
    </div>
  );
}
