import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import {
  getSettings,
  listCompanyOptions,
  listCostCentres,
  listRateCard,
  listRooms,
} from "@/lib/birdwing/queries";
import { CostCentresSection, RateCardSection, RoomsSection } from "./masters-sections";
import { InvoiceSettingsForm } from "./invoice-settings-form";

export default async function BirdwingSettingsPage() {
  const user = await requireUser();
  await requireAdmin(user);

  const [settings, companies, rooms, rateCard, centres] = await Promise.all([
    getSettings(),
    listCompanyOptions(),
    listRooms(),
    listRateCard(),
    listCostCentres(),
  ]);

  return (
    <div className="space-y-4">
      <InvoiceSettingsForm settings={settings} companies={companies} />
      <RateCardSection items={rateCard} />
      <RoomsSection rooms={rooms} />
      <CostCentresSection centres={centres} />
    </div>
  );
}
