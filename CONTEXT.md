# GarageFlow

GarageFlow is the day-to-day operating system for an independent general-repair garage: it tracks customers, their vehicles, the work done on those vehicles, and getting paid for it.

## Language

**Account**:
The paying tenant — the business that subscribes to GarageFlow. Owns one or more Locations. Billing and plan tier attach here.
_Avoid_: Tenant, org, company, garage (as the top-level entity)

**Location**:
A single physical shop (branch) under an Account. All operational data scopes to a Location. MVP Accounts have exactly one; the concept is hidden in the UI until multi-branch ships.
_Avoid_: Branch (in code/schema), garage, shop, site

**User**:
A login identity within an Account (owner, front-desk, manager) with permissions. Distinct from a Mechanic.
_Avoid_: Login, seat, member

**Mechanic**:
An assignable worker a Repair Order or Appointment is given to. In the MVP often just a name with no login; may be linked to a User when granted mobile-app access. The per-plan "mechanic" limit counts Mechanics, not Users.
_Avoid_: Technician, employee, staff, worker

**Customer**:
A person or organization the garage does work for. Owns zero or more Vehicles. Distinct from a User (a Customer never logs in during the MVP).
_Avoid_: Client, account (Account is the tenant)

**Vehicle**:
A specific car (or motorcycle) the garage services, identified primarily by registration plate and VIN. Has a current-owner link to a Customer that can change over time (resale). Accumulates a Service History that stays with the Vehicle, not the owner.
_Avoid_: Car, auto

**Service History**:
The derived timeline of every Repair Order ever performed on a Vehicle, keyed by the Vehicle (VIN/plate) regardless of who owned it at the time. Not stored separately — it is a view over Repair Orders.
_Avoid_: Log, records

**Repair Order**:
The central work record for one visit of one Vehicle: the complaint, diagnosis, work performed, parts, labor, photos, and its progress on the Kanban board. The heart of the app. Projects into two documents: the Work Card (narrative + operational) and the Invoice (financial/legal). Its single assigned Mechanic is an optional lead/owner — actual labor is attributed on the Line Items.
_Avoid_: Job, ticket, work order, RO (in prose)

**Appointment**:
A reserved time slot on the calendar for a mechanic and/or bay, created from online booking or by phone. Optional: walk-ins have none. When the car arrives, a Repair Order is opened, optionally linked to the Appointment.
_Avoid_: Booking, reservation, slot

**Kanban Stage**:
Where a Vehicle physically is in the workflow. A fixed, ordered set of six: Waiting, Diagnosing, Waiting for Parts, Repairing, Ready, Delivered (terminal). A Location may hide stages it doesn't use, but cannot add or reorder them. Independent of invoice status and payment status.
_Avoid_: Column, state, job status, status (unqualified)

**Complaint**:
The problem in the customer's own words, captured when the Vehicle comes in ("squeaks when braking"). Distinct from the Diagnosis. Shown on the Work Card.
_Avoid_: Issue, problem, symptom (as the field name)

**Diagnosis**:
The mechanic's finding after inspecting the Vehicle ("front pads at 2mm, disc scored") — the analysis that defines the actual work needed. Distinct from the Complaint. Shown on the Work Card, not the Invoice.
_Avoid_: Fault, finding, assessment

**Line Item**:
One priced row on a Repair Order, typed as either Labor or Part, carrying quantity, unit price, and VAT rate. A Labor line also records the Mechanic who performed it and the hours worked (hours × rate = amount), so multiple mechanics can contribute to one order. The Invoice and all revenue/profit reporting are built from Line Items.
_Avoid_: Row, entry, part (when you mean the line, not the physical part)

**Work Card**:
The operational, customer-facing document generated on demand from a Repair Order: the customer's complaint, the mechanic's diagnosis, and the work done — by whom, for how long, with which parts — plus photos. A rendered view of the RO, not a stored or frozen entity. Overlaps the Invoice's line items but adds the complaint/diagnosis narrative; the Invoice is the financial/legal subset.
_Avoid_: Job card, work order, repair sheet (in prose), работна карта (use the English term in code)

**Invoice**:
A legal document generated from a Repair Order's Line Items and frozen at issue time (gapless sequential number, VAT snapshot). Immutable once issued; corrections happen via a Credit Note. Carries the priced lines and legal fields only — not the internal diagnosis narrative.
_Avoid_: Bill, receipt

**Credit Note**:
A corrective document that adjusts an already-issued Invoice (the only way to "change" one).
_Avoid_: Refund, correction

**Consent**:
A timestamped, revocable record that a Customer agreed to a specific optional purpose (e.g. SMS/Viber reminders, marketing). Not a single flag, and not the basis for servicing/invoicing (those rest on contract and legal obligation).
_Avoid_: GDPR flag, opt-in

**Anonymization**:
Satisfying a right-to-erasure request by stripping a Customer's PII and unlinking it from Vehicles, while retaining issued Invoices with the legally-required minimum. Distinct from deletion.
_Avoid_: Deletion, erasure (as a synonym for row removal)
