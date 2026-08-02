"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Print / download the фактура (GF-17). "Download" in the MVP is the browser's own
 * print-to-PDF (ADR-0006 keeps fiscalization/PDF generation out of the MVP), so this
 * just triggers `window.print()`; the page's `@media print` rules strip the app
 * chrome and controls, leaving a clean фактура sheet. Hidden from the printout itself.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
