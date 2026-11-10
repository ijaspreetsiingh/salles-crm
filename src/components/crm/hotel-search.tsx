import { useState } from "react";
import {
  BedDouble,
  Building2,
  Info,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Utensils,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiQuery } from "@/lib/api/hooks";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";
import {
  searchHotels,
  fetchContractRates,
  createContractRate,
  deleteContractRate,
  type HotelSearchResult,
  type HotelContractRate,
} from "@/lib/api/modules";

/* ==========================================================================
   Hotel Search — live Hotelbeds search when API keys are set, or manual
   contract rates when not configured.

   Tab 1: Search  — destination + dates → hotel cards with room rows,
                    "Add to quotation" per room.
   Tab 2: Rates   — full contract rate CRUD (replaces old hotel-rates-panel
                    when accessed from the "Hotel search" tab).
   ========================================================================== */

// ── Meal plan labels ─────────────────────────────────────────────────────────
const MEAL_LABELS: Record<string, string> = {
  EP: "Room only",
  BB: "Bed & breakfast",
  CP: "Continental breakfast",
  HB: "Half board",
  MAP: "Half board",
  FB: "Full board",
  AP: "All inclusive",
  AI: "All inclusive",
};
const mealLabel = (code: string) => MEAL_LABELS[code] ?? code;

// ── currency formatter ────────────────────────────────────────────────────────
const fmt = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    n,
  );

// ── component ─────────────────────────────────────────────────────────────────
type SearchTab = "search" | "rates";

export function HotelSearch() {
  const { status, settings, getRows, update } = useCRM();
  const currency = settings.currency || "INR";

  const [activeTab, setActiveTab] = useState<SearchTab>("search");

  // ── search form
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<HotelSearchResult | null>(null);
  const [expandedHotel, setExpandedHotel] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!destination.trim()) {
      toast.error("Enter a destination");
      return;
    }
    if (!checkIn) {
      toast.error("Select check-in date");
      return;
    }
    if (!checkOut) {
      toast.error("Select check-out date");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const res = await searchHotels({
        destination: destination.trim(),
        checkIn,
        checkOut,
        rooms,
        adults,
      });
      setResult(res);
      if (res.hotels.length === 0)
        toast.info("No hotels found — try a different destination or dates");
    } catch (err) {
      toast.error(errorMessage(err, "Search failed"));
    } finally {
      setSearching(false);
    }
  };

  const nights =
    checkIn && checkOut
      ? Math.max(
          0,
          Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000),
        )
      : 0;

  // ── contract rates CRUD
  const { data: rates, reload: reloadRates } = useApiQuery(
    () => fetchContractRates(),
    [],
    status === "ready" && activeTab === "rates",
  );

  const [rateForm, setRateForm] = useState<Omit<HotelContractRate, "id" | "createdAt">>({
    hotelName: "",
    city: "",
    country: "",
    roomType: "Standard",
    mealPlan: "CP",
    season: "All year",
    validFrom: null,
    validTo: null,
    costPrice: 0,
    sellingPrice: 0,
    currency,
    basis: "Per room per night",
    cancellation: "",
    supplierName: "",
    notes: "",
    active: true,
  });
  const [rateFormOpen, setRateFormOpen] = useState(false);
  const [rateFormBusy, setRateFormBusy] = useState(false);
  const [rateSearch, setRateSearch] = useState("");

  const saveRate = async () => {
    if (!rateForm.hotelName.trim()) {
      toast.error("Hotel name required");
      return;
    }
    setRateFormBusy(true);
    try {
      await createContractRate(rateForm);
      reloadRates();
      setRateFormOpen(false);
      setRateForm({ ...rateForm, hotelName: "", city: "", roomType: "Standard" });
      toast.success("Rate added");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save rate"));
    } finally {
      setRateFormBusy(false);
    }
  };

  const removeRate = async (id: string) => {
    try {
      await deleteContractRate(id);
      reloadRates();
      toast.success("Rate deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete"));
    }
  };

  const filteredRates = (rates ?? []).filter(
    (r) =>
      !rateSearch.trim() ||
      r.hotelName.toLowerCase().includes(rateSearch.toLowerCase()) ||
      r.city.toLowerCase().includes(rateSearch.toLowerCase()),
  );

  /**
   * Adds the chosen room as a priced line item on the newest draft quotation.
   * Previously this button only showed a toast, so the agent retyped the rate
   * by hand and the quote never received the room.
   */
  const addRoomToQuote = (hotelName: string, roomName: string, net: number) => {
    const drafts = getRows("quotations")
      .filter((q) => String(q.status).toLowerCase() === "draft")
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    const draft = drafts[0];
    if (!draft) {
      toast.error("Create a draft quotation first, then add hotel rooms to it from here.");
      return;
    }
    const stayNights = Math.max(1, nights);
    const raw = draft.extra?.["quoteItems"];
    let items: Array<{ label: string; qty: number; rate: number }> = [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        items = parsed
          .filter((item) => item && typeof item.rate === "number")
          .map((item) => ({
            label: String(item.label || "Package component").slice(0, 90),
            qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
            rate: Number(item.rate),
          }));
      }
    } catch {
      items = [];
    }
    items.push({
      label: `${hotelName} — ${roomName} × ${stayNights} night${stayNights === 1 ? "" : "s"}`.slice(
        0,
        90,
      ),
      qty: 1,
      rate: Math.round(net * stayNights),
    });
    void update("quotations", {
      ...draft,
      extra: { ...(draft.extra ?? {}), quoteItems: JSON.stringify(items) },
    });
    toast.success(`Added ${roomName} to ${draft.id || "your draft quote"}.`);
  };

  // ── render
  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab selector */}
      <div className="flex items-center gap-1 rounded-xl border border-line bg-glass-1 p-1 w-fit">
        {(
          [
            { key: "search", label: "Live search" },
            { key: "rates", label: "Contract rates" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              activeTab === key
                ? "bg-ink text-on-ink shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Search tab ─────────────────────────────────────────────────── */}
      {activeTab === "search" && (
        <div className="flex flex-col gap-4">
          {/* Search form card */}
          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2 grid gap-1">
                <Label>Destination</Label>
                <div className="flex items-center gap-2 rounded-lg border border-input px-3 h-9">
                  <MapPin className="size-4 text-muted shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                    placeholder="e.g. Dubai, BKK, LDN…"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <Label>Check-in</Label>
                <Input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div className="grid gap-1">
                <Label>Check-out</Label>
                <Input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  min={checkIn || new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div className="grid gap-1">
                <Label>Rooms / Guests</Label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-input px-2 h-9 flex-1">
                    <BedDouble className="size-3.5 text-muted" />
                    <input
                      type="number"
                      min={1}
                      max={10}
                      className="w-8 bg-transparent text-sm outline-none"
                      value={rooms}
                      onChange={(e) => setRooms(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">rooms</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-input px-2 h-9 flex-1">
                    <span className="text-xs text-muted">👤</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="w-8 bg-transparent text-sm outline-none"
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">adults</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={() => void handleSearch()} disabled={searching} className="px-6">
                {searching ? (
                  <RefreshCw className="size-4 animate-spin mr-2" />
                ) : (
                  <Search className="size-4 mr-2" />
                )}
                {searching ? "Searching…" : "Search hotels"}
              </Button>
              {nights > 0 && (
                <span className="text-sm text-muted">
                  {nights} night{nights !== 1 ? "s" : ""} · {rooms} room{rooms !== 1 ? "s" : ""} ·{" "}
                  {adults} adult{adults !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Unconfigured notice */}
          {result && !result.configured && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Info className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Showing contract rates — live search not configured
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {result.message ??
                    "Add HOTELBEDS_API_KEY and HOTELBEDS_SECRET to the backend .env to enable live search."}
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {result && result.hotels.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {result.hotels.length} hotel{result.hotels.length !== 1 ? "s" : ""} found
              </p>

              {result.hotels.map((hotel) => {
                const isExpanded = expandedHotel === hotel.code;
                const cheapest = hotel.rooms.reduce(
                  (min, r) => (r.net < min ? r.net : min),
                  hotel.rooms[0]?.net ?? 0,
                );

                return (
                  <div
                    key={hotel.code}
                    className="rounded-2xl border border-line bg-white shadow-sm overflow-hidden"
                  >
                    {/* Hotel header */}
                    <button
                      className="flex w-full items-center gap-4 p-4 text-left hover:bg-glass-1 transition-colors"
                      onClick={() => setExpandedHotel(isExpanded ? null : hotel.code)}
                    >
                      {/* Icon */}
                      <div className="size-12 shrink-0 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Building2 className="size-6 text-blue-500" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground">{hotel.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {hotel.categoryName && (
                                <span className="text-xs text-muted">{hotel.categoryName}</span>
                              )}
                              <span className="text-muted">·</span>
                              <div className="flex items-center gap-1 text-xs text-muted">
                                <MapPin className="size-3" />
                                {hotel.destinationName}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted">From</p>
                            <p className="text-base font-bold text-foreground">
                              {fmt(cheapest, result.currency || currency)}
                            </p>
                            <p className="text-[10px] text-muted">per room/night</p>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-muted">
                        {isExpanded ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </div>
                    </button>

                    {/* Room rows (expanded) */}
                    {isExpanded && (
                      <div className="border-t border-line divide-y divide-line/50">
                        {hotel.rooms.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-muted">No rooms available</p>
                        ) : (
                          hotel.rooms.map((room, idx) => (
                            <div
                              key={`${room.code}-${idx}`}
                              className="flex items-center gap-4 px-4 py-3"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{room.name}</p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="inline-flex items-center gap-1 text-xs text-muted">
                                    <Utensils className="size-3" />
                                    {mealLabel(room.boardName)}
                                  </span>
                                  {room.allotment > 0 && (
                                    <span className="text-xs text-muted">
                                      {room.allotment} room{room.allotment !== 1 ? "s" : ""} left
                                    </span>
                                  )}
                                  {room.cancellationPolicies && (
                                    <span className="text-xs text-amber-600">
                                      {room.cancellationPolicies.slice(0, 40)}
                                      {room.cancellationPolicies.length > 40 ? "…" : ""}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p className="text-base font-bold text-foreground">
                                  {fmt(room.net, room.currency || result.currency || currency)}
                                </p>
                                {nights > 0 && (
                                  <p className="text-xs text-muted">
                                    {fmt(
                                      room.net * nights,
                                      room.currency || result.currency || currency,
                                    )}{" "}
                                    total
                                  </p>
                                )}
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => addRoomToQuote(hotel.name, room.name, room.net)}
                              >
                                <Plus className="size-3.5 mr-1" />
                                Add to quote
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!result && !searching && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-16 text-muted gap-3">
              <Building2 className="size-14" />
              <p className="text-sm font-medium">Search for hotels above</p>
              <p className="text-xs text-center max-w-xs">
                Enter a city or IATA destination code. Live results come from Hotelbeds when
                configured — otherwise your contract rates are shown.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Contract rates tab ─────────────────────────────────────────── */}
      {activeTab === "rates" && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-input px-3 h-9 flex-1 max-w-xs">
              <Search className="size-4 text-muted shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                placeholder="Search hotel or city…"
                value={rateSearch}
                onChange={(e) => setRateSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon" onClick={reloadRates} title="Refresh">
              <RefreshCw className="size-4" />
            </Button>
            <Button size="sm" onClick={() => setRateFormOpen((o) => !o)}>
              <Plus className="size-4 mr-1" />
              Add rate
            </Button>
          </div>

          {/* Inline add form */}
          {rateFormOpen && (
            <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold mb-4">New contract rate</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="grid gap-1">
                  <Label>Hotel name *</Label>
                  <Input
                    value={rateForm.hotelName}
                    onChange={(e) => setRateForm({ ...rateForm, hotelName: e.target.value })}
                    placeholder="Grand Hyatt Dubai"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>City</Label>
                  <Input
                    value={rateForm.city}
                    onChange={(e) => setRateForm({ ...rateForm, city: e.target.value })}
                    placeholder="Dubai"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Country</Label>
                  <Input
                    value={rateForm.country}
                    onChange={(e) => setRateForm({ ...rateForm, country: e.target.value })}
                    placeholder="UAE"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Room type</Label>
                  <Input
                    value={rateForm.roomType}
                    onChange={(e) => setRateForm({ ...rateForm, roomType: e.target.value })}
                    placeholder="Deluxe Room"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Meal plan</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={rateForm.mealPlan}
                    onChange={(e) => setRateForm({ ...rateForm, mealPlan: e.target.value })}
                  >
                    {["EP", "BB", "CP", "HB", "MAP", "FB", "AP", "AI"].map((p) => (
                      <option key={p} value={p}>
                        {p} — {mealLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label>Season</Label>
                  <Input
                    value={rateForm.season}
                    onChange={(e) => setRateForm({ ...rateForm, season: e.target.value })}
                    placeholder="All year / High season"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Valid from</Label>
                  <Input
                    type="date"
                    value={rateForm.validFrom ?? ""}
                    onChange={(e) =>
                      setRateForm({ ...rateForm, validFrom: e.target.value || null })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Valid to</Label>
                  <Input
                    type="date"
                    value={rateForm.validTo ?? ""}
                    onChange={(e) => setRateForm({ ...rateForm, validTo: e.target.value || null })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Currency</Label>
                  <Input
                    value={rateForm.currency}
                    onChange={(e) =>
                      setRateForm({
                        ...rateForm,
                        currency: e.target.value.toUpperCase().slice(0, 3),
                      })
                    }
                    placeholder="INR"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Cost price</Label>
                  <Input
                    type="number"
                    min={0}
                    value={rateForm.costPrice}
                    onChange={(e) =>
                      setRateForm({ ...rateForm, costPrice: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Selling price</Label>
                  <Input
                    type="number"
                    min={0}
                    value={rateForm.sellingPrice}
                    onChange={(e) =>
                      setRateForm({ ...rateForm, sellingPrice: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Supplier</Label>
                  <Input
                    value={rateForm.supplierName}
                    onChange={(e) => setRateForm({ ...rateForm, supplierName: e.target.value })}
                    placeholder="SOTC, Thomas Cook…"
                  />
                </div>
                <div className="sm:col-span-2 grid gap-1">
                  <Label>Cancellation policy</Label>
                  <Input
                    value={rateForm.cancellation}
                    onChange={(e) => setRateForm({ ...rateForm, cancellation: e.target.value })}
                    placeholder="Free cancellation up to 7 days before check-in"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                {rateForm.costPrice > 0 && rateForm.sellingPrice > 0 && (
                  <span className="text-sm text-muted">
                    Margin:{" "}
                    <strong
                      className={
                        rateForm.sellingPrice > rateForm.costPrice
                          ? "text-green-600"
                          : "text-red-500"
                      }
                    >
                      {fmt(rateForm.sellingPrice - rateForm.costPrice, rateForm.currency)} (
                      {Math.round(
                        ((rateForm.sellingPrice - rateForm.costPrice) / rateForm.sellingPrice) *
                          100,
                      )}
                      %)
                    </strong>
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={() => setRateFormOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={rateFormBusy} onClick={() => void saveRate()}>
                    {rateFormBusy ? "Saving…" : "Save rate"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Rates table */}
          {filteredRates.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line py-12 text-muted gap-2">
              <BedDouble className="size-12" />
              <p className="text-sm font-medium">No contract rates yet</p>
              <p className="text-xs">Add your negotiated hotel rates to use them in quotations.</p>
              <Button size="sm" className="mt-2" onClick={() => setRateFormOpen(true)}>
                <Plus className="size-4 mr-1" /> Add first rate
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-glass-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Hotel</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Room</th>
                    <th className="px-4 py-3">Board</th>
                    <th className="px-4 py-3">Season</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Selling</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {filteredRates.map((r) => {
                    const margin =
                      r.sellingPrice > 0
                        ? Math.round(((r.sellingPrice - r.costPrice) / r.sellingPrice) * 100)
                        : 0;
                    return (
                      <tr key={r.id} className="hover:bg-glass-1 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{r.hotelName}</td>
                        <td className="px-4 py-3 text-muted">{r.city}</td>
                        <td className="px-4 py-3 text-muted">{r.roomType}</td>
                        <td className="px-4 py-3 text-muted">{mealLabel(r.mealPlan)}</td>
                        <td className="px-4 py-3 text-muted">{r.season}</td>
                        <td className="px-4 py-3 text-right text-muted">
                          {fmt(r.costPrice, r.currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {fmt(r.sellingPrice, r.currency)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              margin >= 15
                                ? "text-green-600"
                                : margin >= 5
                                  ? "text-amber-600"
                                  : "text-red-500",
                            )}
                          >
                            {margin}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted text-xs">{r.supplierName}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void removeRate(r.id)}
                            className="text-muted hover:text-tomato transition-colors text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
