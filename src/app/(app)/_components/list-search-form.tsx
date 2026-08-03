import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * A list page's filter-by-name search — a plain GET form (works without JS),
 * styled like the header's omnibox (SnowUI): a filled, borderless pill with a
 * leading icon that doubles as the submit control.
 */
export function ListSearchForm({
  defaultValue,
  placeholder,
  label,
  submitLabel,
}: {
  defaultValue: string;
  placeholder: string;
  label: string;
  submitLabel: string;
}) {
  return (
    <form className="relative w-full max-w-xs">
      <button
        type="submit"
        aria-label={submitLabel}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <Search className="size-4" />
      </button>
      <Input
        type="search"
        name="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        className="border-transparent bg-muted pl-9 focus-visible:border-input focus-visible:bg-card"
      />
    </form>
  );
}
