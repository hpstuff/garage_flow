"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ScopedVehicle } from "@/server/services/vehicle/service";
import { searchVehiclesAction } from "../vehicles/_actions/vehicle-actions";

/**
 * Global fast plate/VIN search (GF-06) — the primary way the front desk reaches a
 * Vehicle (ADR-0008). Lives in the app header, is focusable from anywhere with
 * "/", searches as you type against a loose plate/VIN match, and opens the chosen
 * Vehicle on Enter or click. A hand-rolled combobox (rather than a Popover) so
 * focus stays in the input and the arrow keys drive the list.
 */

/** True when focus is already in a text field — so "/" types a slash, not a shortcut. */
function isTypingTarget(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (element as HTMLElement).isContentEditable
  );
}

/** The car's short description — make/model/year, whichever are known. */
function describe(vehicle: ScopedVehicle): string {
  return [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ");
}

export function VehicleSearch() {
  const t = useTranslations("search");
  const router = useRouter();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScopedVehicle[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** The query the most recent request was for — guards against stale responses. */
  const latestQuery = useRef("");

  // "/" focuses the search from anywhere in the app (unless already typing).
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "/" && !isTypingTarget(document.activeElement)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search-as-you-type. The trailing-response guard keeps a slow reply
  // for an earlier query from clobbering a newer one.
  useEffect(() => {
    const term = query.trim();
    latestQuery.current = term;
    if (!term) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    const handle = setTimeout(async () => {
      const result = await searchVehiclesAction(term);
      if (latestQuery.current !== term) {
        return;
      }
      setResults(result.ok ? result.data : []);
      setActive(0);
      setOpen(true);
      setSearching(false);
    }, 180);

    return () => clearTimeout(handle);
  }, [query]);

  function goTo(vehicle: ScopedVehicle) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/vehicles/${vehicle.id}`);
  }

  function clearQuery() {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const vehicle = results[active];
      if (vehicle) {
        event.preventDefault();
        goTo(vehicle);
      }
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={t("placeholder")}
        aria-label={t("label")}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (results.length > 0) {
            setOpen(true);
          }
        }}
        className="border-transparent bg-muted pl-9 pr-9 focus-visible:border-input focus-visible:bg-card"
      />
      {query ? (
        <button
          type="button"
          onClick={clearQuery}
          aria-label={t("clear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : (
        <kbd
          title={t("shortcutHint")}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1.5 font-mono text-xs text-muted-foreground"
        >
          /
        </kbd>
      )}

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t("label")}
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {searching ? t("searching") : t("noResults")}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((vehicle, index) => {
                const description = describe(vehicle);
                return (
                  <li key={vehicle.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => goTo(vehicle)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                        index === active ? "bg-accent text-accent-foreground" : "",
                      )}
                    >
                      <span className="font-medium">{vehicle.plate ?? vehicle.vin ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {[description, vehicle.customerName || t("noOwner")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
