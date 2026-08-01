import type { ScopedVehicle } from "@/server/services/vehicle/service";

/**
 * A Vehicle's label in the order's Vehicle picker: its everyday identifier
 * (plate, else VIN), the make/model if known, and the current owner — enough for
 * the front desk to pick the right car at a glance.
 */
export function vehicleOptionLabel(vehicle: ScopedVehicle): string {
  const identifier = vehicle.plate ?? vehicle.vin ?? "—";
  const description = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return [identifier, description, vehicle.customerName].filter(Boolean).join(" · ");
}
