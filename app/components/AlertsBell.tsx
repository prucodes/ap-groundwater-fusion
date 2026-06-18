"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { titleCase } from "../lib/data";
import { activeAlerts, SEVERITY_META } from "../lib/alerts";
import { IconArrowRight, IconBell } from "./icons";

export function AlertsBell({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const alerts = activeAlerts();
  const urgent = alerts.filter((a) => a.severity === "Critical" || a.severity === "High");
  const count = urgent.length;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="alertsWrap" ref={ref}>
      <button className="utilBtn" type="button" onClick={() => setOpen((o) => !o)} aria-label="Alerts" title="Early warning">
        <span className="bellIcon">
          <IconBell />
          {count > 0 && <span className="bellBadge">{count}</span>}
        </span>
        {!collapsed && <span className="utilLabel">Alerts</span>}
      </button>

      {open && (
        <div className="alertsPanel">
          <div className="alertsHead">
            <strong>Early Warning</strong>
            <span>{count} urgent · {alerts.length} active</span>
          </div>
          <div className="alertsList">
            {alerts.slice(0, 6).map((a) => {
              const meta = SEVERITY_META[a.severity];
              return (
                <button
                  key={a.mandal.id}
                  className="alertItem"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/mandals/${a.mandal.id}`);
                  }}
                >
                  <span className="alertDot" style={{ background: meta.color }} />
                  <span className="alertBody">
                    <span className="alertTitle">
                      {titleCase(a.mandal.mandal_name)}
                      <span style={{ color: meta.color, fontWeight: 700, marginLeft: 6, fontSize: 10.5 }}>
                        {meta.label}
                      </span>
                    </span>
                    <span className="alertSub">
                      {titleCase(a.mandal.district_name)} · {a.factors[0]?.label ?? "review"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button className="alertsFoot" onClick={() => { setOpen(false); router.push("/alerts"); }}>
            Open early-warning console <IconArrowRight />
          </button>
        </div>
      )}
    </div>
  );
}
