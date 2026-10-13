import { Card } from "@/components/ui/card";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import {
  getSettings,
  getStay,
  listCostCentres,
  listRateCard,
  listRooms,
} from "@/lib/birdwing/queries";
import { CHANNEL_LABELS } from "@/lib/birdwing/shared";
import { canEditCharges, canEditRooms, issueBlocker } from "@/lib/birdwing/workflow";
import { formatDate, formatMoney, todayInIndia } from "@/lib/format";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StayStatusBadge, UseBadge } from "../../_components/stay-badges";
import { ChargesPanel } from "./_components/charges-panel";
import { CheckinForm, StayDetailsForm } from "./_components/details-forms";
import { DocumentsPanel } from "./_components/documents-panel";
import { InvoicePanel } from "./_components/invoice-panel";
import { ReceiptsPanel, SettlePanel } from "./_components/money-panels";
import { RoomsPanel } from "./_components/rooms-panel";
import { ReviewedButton, StayActions } from "./_components/stay-actions";

const money = (value: number) => formatMoney(value, { paise: value % 1 !== 0 });

export default async function StayPage({ params }: { params: Promise<{ stayId: string }> }) {
  const { stayId } = await params;
  const stay = await getStay(stayId);
  if (!stay) notFound();

  const [rooms, rateCard, centres, settings] = await Promise.all([
    listRooms(),
    listRateCard(),
    listCostCentres(),
    getSettings(),
  ]);
  const activeCentres = centres
    .filter((centre) => centre.isActive || centre.id === stay.costCentreId)
    .map(({ id, name }) => ({ id, name }));
  const liveRooms = stay.rooms.filter((room) => !room.released);
  const roomNights = liveRooms.reduce((sum, room) => sum + room.nights, 0);
  const title = stay.isBlock ? "Room block" : (stay.guest?.name ?? "A stay");
  const flagged = stay.reviewFlags.length > 0 && !stay.reviewedAt;
  const { money: figures } = stay;

  return (
    <div className="space-y-4">
      <Link
        href="/birdwing/stays"
        className="text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All stays
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-xl font-semibold tracking-tight">{title}</h2>
              <span className="text-muted font-mono text-sm">{stay.ref}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StayStatusBadge status={stay.status} />
              <UseBadge use={stay.use} />
              {stay.costCentreName && (
                <span className="text-muted text-xs">charged to {stay.costCentreName}</span>
              )}
            </div>
            <p className="text-muted mt-2 text-sm">
              {formatDate(stay.arrival)}
              {stay.nights > 0
                ? ` → ${formatDate(stay.departure)} · ${stay.nights} night${stay.nights === 1 ? "" : "s"}`
                : " · day visit"}
              {liveRooms.length > 0 &&
                ` · ${[...new Set(liveRooms.map((room) => room.roomCode))].join(", ")}`}
              {!stay.isBlock &&
                ` · ${stay.adults + stay.children} guest${stay.adults + stay.children === 1 ? "" : "s"}`}
              {!stay.isBlock && ` · ${CHANNEL_LABELS[stay.channel]}`}
            </p>
            {stay.isBlock && stay.notes && <p className="text-muted text-sm">{stay.notes}</p>}
            {stay.status === "cancelled" && stay.cancelReason && (
              <p className="text-danger mt-1 text-sm">Cancelled: {stay.cancelReason}</p>
            )}
            {stay.guest?.phone && (
              <a
                href={`tel:${stay.guest.phone}`}
                className="text-accent mt-1 inline-block text-sm font-medium"
              >
                {stay.guest.phone}
              </a>
            )}
          </div>
          <StayActions stayId={stay.id} stayRef={stay.ref} status={stay.status} />
        </div>
      </Card>

      {flagged && (
        <Card className="border-warning/40 bg-warning/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-foreground text-sm font-semibold">
                From the old income sheet — please check
              </p>
              <ul className="text-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {stay.reviewFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
            <ReviewedButton stayId={stay.id} />
          </div>
        </Card>
      )}

      {!stay.isBlock && (
        <FigureBand className="sm:grid-cols-2 lg:grid-cols-4">
          <FigureBandCell>
            <Figure
              label="Billed"
              value={money(figures.billed)}
              hint={
                stay.otaCommission || stay.discount
                  ? `${money(figures.charged)} less ${money(stay.otaCommission + stay.discount)}`
                  : "the charges, with GST"
              }
              size="lg"
            />
          </FigureBandCell>
          <FigureBandCell>
            <Figure label="Received" value={money(figures.collected)} size="lg" />
          </FigureBandCell>
          <FigureBandCell>
            <Figure
              label={stay.internal ? "Charged to Goodearth" : "Written off"}
              value={money(figures.settled)}
              size="lg"
            />
          </FigureBandCell>
          <FigureBandCell>
            <Figure
              label="Pending"
              value={stay.settled ? "Settled" : money(figures.pending)}
              tone={stay.settled ? "good" : figures.pending > 0 ? "warn" : undefined}
              hint={figures.pending < -1 ? "more received than billed" : undefined}
              size="lg"
            />
          </FigureBandCell>
        </FigureBand>
      )}

      <RoomsPanel
        stayId={stay.id}
        arrival={stay.arrival}
        departure={stay.departure}
        rooms={stay.rooms}
        options={rooms.filter((room) => room.isActive).map(({ id, code }) => ({ id, code }))}
        editable={canEditRooms(stay.status)}
        legacyRoomCount={stay.legacyRoomCount}
      />

      {!stay.isBlock && (
        <>
          <ChargesPanel
            stayId={stay.id}
            charges={stay.charges}
            rateCard={rateCard}
            editable={canEditCharges({
              isBlock: stay.isBlock,
              hasIssuedInvoice: stay.issuedInvoice !== null,
            })}
            frozenBy={stay.issuedInvoice?.number ?? null}
            roomNights={roomNights}
          />
          <InvoicePanel
            stayId={stay.id}
            guestName={stay.guest?.name ?? ""}
            issued={stay.issuedInvoice}
            history={stay.invoices}
            blocker={issueBlocker({
              isBlock: stay.isBlock,
              hasIssuedInvoice: stay.issuedInvoice !== null,
              chargeCount: stay.charges.length,
              hasCompany: settings.companyId !== null,
            })}
          />
          <ReceiptsPanel
            stayId={stay.id}
            receipts={stay.receipts}
            pending={figures.pending}
            today={todayInIndia()}
            canAdd={stay.status !== "enquiry"}
          />
          {(figures.pending >= 1 || stay.settlements.length > 0) && (
            <SettlePanel
              stayId={stay.id}
              internal={stay.internal}
              settlements={stay.settlements}
              pending={figures.pending}
              costCentres={activeCentres}
              defaultCostCentreId={stay.costCentreId}
              defaultMonth={stay.accountingMonth}
            />
          )}
          {stay.status !== "cancelled" && (
            <>
              <CheckinForm stay={stay} />
              <StayDetailsForm stay={stay} costCentres={activeCentres} />
            </>
          )}
          <DocumentsPanel stayId={stay.id} files={stay.files} />
        </>
      )}

      <p className="text-muted text-xs">
        Made {formatDate(stay.createdAt)}
        {stay.createdByName ? ` by ${stay.createdByName}` : ""}
        {stay.imported ? " · brought over from the old income sheet" : ""}
        {stay.checkinAt ? ` · checked in ${formatDate(stay.checkinAt)}` : ""}
        {stay.checkoutAt ? ` · checked out ${formatDate(stay.checkoutAt)}` : ""}
      </p>
    </div>
  );
}
