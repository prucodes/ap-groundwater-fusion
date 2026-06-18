import { HeaderHero } from "../../components/HeaderHero";
import { IconSettings } from "../../components/icons";

export default function SettingsPage() {
  return (
    <div className="pageWrap">
      <HeaderHero title="Settings" showChips={false} />
      <section className="card">
        <div className="placeholder">
          <span className="phIcon">
            <IconSettings />
          </span>
          <h2>Configuration coming later</h2>
          <p>
            Settings for data sources, refresh cadence, and export targets will be added once official APWRIMS data and
            official mandal boundaries are connected. This is a static prototype — no login, no database.
          </p>
        </div>
      </section>
    </div>
  );
}
