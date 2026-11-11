"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogComponent, CatalogListResponse, ComponentCategory } from "@/types/catalog";
import type { OffersErrorResponse, SerpApiSearchResponse, SerpApiShoppingResult } from "@/types/offers";

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

const moneyLabel = (item: SerpApiShoppingResult): string => {
  const amount = item.price.estimatedPLN;
  return amount ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount.amountCents / 100) : "Cena niedostępna";
};

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
  const [offerKeyword, setOfferKeyword] = useState("");
  const [offerCategory, setOfferCategory] = useState<ComponentCategory | "">("");
  const [offerCandidates, setOfferCandidates] = useState<SerpApiShoppingResult[]>([]);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerMeta, setOfferMeta] = useState<SerpApiSearchResponse["meta"] | null>(null);
  const limit = 6;

  const loadOffers = async (keyword: string, expectedCategory: string, resultPage = 1) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword || normalizedKeyword.length > 120) {
      setOfferError("Podaj nazwę produktu od 1 do 120 znaków.");
      return;
    }
    setOfferLoading(true);
    setOfferError(null);
    try {
      const params = new URLSearchParams({ action: "search", keyword: normalizedKeyword, page: String(resultPage), limit: "12" });
      if (expectedCategory) params.set("category", expectedCategory);
      const response = await fetch(`/api/v1/offers?${params.toString()}`);
      const body = await response.json() as SerpApiSearchResponse | OffersErrorResponse;
      if (!response.ok || !("data" in body) || !Array.isArray(body.data)) {
        throw new Error("message" in body ? body.message : "Nie udało się wyszukać ofert.");
      }
      setOfferCandidates(body.data);
      setOfferMeta(body.meta);
    } catch (reason: unknown) {
      setOfferCandidates([]);
      setOfferMeta(null);
      setOfferError(reason instanceof Error ? reason.message : "Nie udało się wyszukać ofert.");
    } finally {
      setOfferLoading(false);
    }
  };

  const searchOffers = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadOffers(offerKeyword, offerCategory);
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
          <p className="lede">Przeglądaj modele, sprawdzaj podstawową kompatybilność i porównuj jawnie wybrane oferty Google Shopping.</p>
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
        <aside className="catalog-detail card">{selected ? <><span className="section-kicker">SZCZEGÓŁY REKORDU</span><h2>{selected.name}</h2><p className="catalog-detail-description">{selected.description}</p><dl>{Object.entries(selected.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className="catalog-detail-note"><strong>Cena katalogowa niedostępna</strong><span>To opis modelu bez automatycznego przypisywania ceny z podobnej oferty.</span></div></> : <><span className="section-kicker">SZCZEGÓŁY REKORDU</span><h2>Wybierz element</h2><p className="catalog-detail-description">Kliknij rekord, aby zobaczyć znane specyfikacje i pochodzenie danych.</p><div className="catalog-detail-empty">Oferty są wyszukiwane osobno i wymagają jawnego zatwierdzenia.</div></>}</aside>
      </div>
      <section className="offer-lookup card">
        <div>
          <span className="section-kicker">OFERTA / GOOGLE SHOPPING</span>
          <h2>Porównaj oferty</h2>
          <p className="catalog-detail-description">Wyszukaj produkt, wybierz konkretną ofertę i przejdź do źródła. Cena nie jest automatycznie przypisywana do modelu katalogowego.</p>
        </div>
        <form className="offer-lookup-form" onSubmit={searchOffers}>
          <label>Szukaj oferty<input maxLength={120} value={offerKeyword} placeholder="np. RTX 4070, SSD 512 GB" onChange={(event) => setOfferKeyword(event.target.value)} /></label>
          <label>Rodzaj podzespołu<select value={offerCategory} onChange={(event) => setOfferCategory(event.target.value as ComponentCategory | "")}><option value="">Dowolny</option>{categories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
          <button className="button primary" type="submit" disabled={offerLoading}>{offerLoading ? "Szukam…" : "Szukaj ofert"}</button>
          {selected && <button className="button secondary" type="button" onClick={() => { setOfferKeyword(selected.name); setOfferCategory(selected.category); }}>Użyj nazwy modelu</button>}
        </form>
        {offerError && <div className="catalog-message error" role="alert">{offerError}</div>}
        {offerMeta && <div className="offer-search-meta">Znaleziono {offerMeta.total} ofert · źródło: Google Shopping</div>}
        {offerCandidates.length > 0 && <div className="offer-candidates">{offerCandidates.map((candidate) => <article className="offer-candidate" key={JSON.stringify([candidate.providerProductId ?? candidate.title, candidate.source, candidate.price.original])}><div><strong>{candidate.title}</strong><small>{candidate.source ?? "Sklep nieznany"}{candidate.sponsored ? " · sponsorowane" : ""}</small></div><div className="offer-candidate-actions"><span className="offer-result-price">{moneyLabel(candidate)}<small>Cena orientacyjna, może się różnić</small></span>{candidate.link && <a className="text-button" href={candidate.link} target="_blank" rel="noreferrer">Zobacz ofertę ↗</a>}</div></article>)}</div>}
        {offerMeta && <div className="catalog-pagination"><button className="text-button" disabled={offerLoading || offerMeta.page <= 1} type="button" onClick={() => void loadOffers(offerMeta.query, offerMeta.expectedCategory ?? "", offerMeta.page - 1)}>← Poprzednie oferty</button><span>Strona {offerMeta.page} z {Math.max(1, Math.ceil(offerMeta.total / offerMeta.limit))}</span><button className="text-button" disabled={offerLoading || !offerMeta.hasNext} type="button" onClick={() => void loadOffers(offerMeta.query, offerMeta.expectedCategory ?? "", offerMeta.page + 1)}>Następne oferty →</button></div>}
      </section>
    </div>
  );
}
