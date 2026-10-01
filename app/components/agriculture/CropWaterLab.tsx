"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CROP_REFERENCE, CROP_REFERENCE_URL, CROP_STAGES, DEFAULT_BUDGET, cropWaterBudget, type CropKey } from "../../lib/agriculture";
import { IconCloudRain, IconDroplet, IconLeaf, IconPause, IconPlay, IconSun, IconTarget, IconSearch } from "../icons";
import { SceneErrorBoundary } from "../living-water-table/SceneErrorBoundary";
import type { FieldFocus } from "./NaturalCropScene";
import { ATLAS_HEIGHT, CROP_FRAMES } from "./cropArtwork";
import styles from "./AgricultureWorkspace.module.css";
import field from "./CropField.module.css";

const CropFieldScene = dynamic(() => import("./NaturalCropScene"), { ssr: false });

const assetRoot = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets`;
const fmt = (value: number) => value.toFixed(1);

export function CropWaterLab() {
  const [input, setInput] = useState({ ...DEFAULT_BUDGET });
  const [moving, setMoving] = useState(true);
  const [focus, setFocus] = useState<FieldFocus>("roots");
  const [resetCamera, setResetCamera] = useState(0);
  const [lens, setLens] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onFailure = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    const preload = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNearby(true); }, { rootMargin: "200px" });
    const observe = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (scene.current) { preload.observe(scene.current); observe.observe(scene.current); }
    return () => { media.removeEventListener("change", update); preload.disconnect(); observe.disconnect(); };
  }, []);
  const budget = cropWaterBudget(input);
  const profile = CROP_REFERENCE[input.crop];
  const notes = {
    rain: "Effective rain is the portion available to the crop after losses. It is an assumed seven-day total here, not the app's monthly rainfall.",
    roots: "The usable root-zone reserve buffers a rain gap. It is a scenario input, not groundwater depth or satellite soil-moisture percentile.",
    crop: "Reference evapotranspiration and the crop coefficient set standard-condition crop ET. These coefficients are not calibrated field advice.",
  };

  return <section id="crop-water-lab" className={styles.section} aria-labelledby="crop-lab-title">
    <header className={styles.sectionHead}>
      <div><span className={styles.eyebrow}>02 / The field water budget</span><h2 id="crop-lab-title">A crop's needs change with its stage.</h2></div>
      <span className={styles.scenarioBadge}>Illustrative scenario · 7 days</span>
    </header>
    <div className={field.lab}>
      <div className={field.visual}>
        <div className={styles.sceneToolbar}>
          <div className={styles.segmented} role="group" aria-label="Water-cycle focus">
            <button type="button" aria-pressed={focus === "rain"} onClick={() => setFocus("rain")}><IconCloudRain />Rain</button>
            <button type="button" aria-pressed={focus === "roots"} onClick={() => setFocus("roots")}><IconDroplet />Root zone</button>
            <button type="button" aria-pressed={focus === "crop"} onClick={() => setFocus("crop")}><IconLeaf />Crop ET</button>
          </div>
          <div className={field.tools}>
            <button className={styles.iconButton} type="button" aria-label="Inspect crop and soil detail" title="Inspect crop and soil detail" aria-pressed={lens} onClick={() => setLens(value => !value)}><IconSearch /></button>
            <button className={styles.iconButton} type="button" aria-label="Reset field view" title="Reset field view" onClick={() => setResetCamera(value => value + 1)}><IconTarget /></button>
            <button className={styles.iconButton} type="button" aria-label={moving ? "Pause water animation" : "Play water animation"} title={reducedMotion ? "Motion is disabled by your device preference" : moving ? "Pause water animation" : "Play water animation"} onClick={() => setMoving(!moving)}>{moving ? <IconPause /> : <IconPlay />}</button>
          </div>
        </div>
        <div ref={scene} className={field.scene} data-testid="crop-field" data-ready={ready && !failed} data-moving={moving && !reducedMotion} data-crop={input.crop} data-stage={input.stage} data-focus={focus}>
          <div className={field.sceneTitle}><span>THE CROP / {String(input.stage + 1).padStart(2, "0")}</span><strong>{profile.name}<small>{CROP_STAGES[input.stage]}</small></strong></div>
          <div className={field.stageCoefficient}><span>REFERENCE Kc</span><strong>{budget.kc.toFixed(2)}</strong></div>
          {(!ready || failed) && <div className={field.fallback}><img src={`${assetRoot}/agriculture-root-zone.webp`} alt="Illustrated crop canopy and roots in a soil cross-section; generic plants, not a surveyed field" width="1774" height="887" /><span role="status">{failed ? "Stage artwork unavailable. Scenario controls remain active." : "Preparing the crop cutaway"}</span></div>}
          {nearby && !failed && <SceneErrorBoundary onError={onFailure} fallback={() => null}>
            <CropFieldScene {...input} demand={budget.demand} moving={moving && !reducedMotion} visible={visible} focus={focus} resetCamera={resetCamera} lens={lens} onReady={onReady} onFailure={onFailure} />
          </SceneErrorBoundary>}
          <div className={field.processCaption} data-focus={focus}>
            <span>{focus === "roots" ? "01 / ROOT-ZONE RESERVE" : focus === "rain" ? "01 / EFFECTIVE RAIN" : "01 / CROP DEMAND"}</span>
            <strong>{focus === "roots" ? fmt(input.reserve) : focus === "rain" ? fmt(input.rain) : fmt(budget.demand)} <small>mm{focus === "roots" ? " at start" : " / 7 days"}</small></strong>
            <small>{focus === "roots" ? "Assumed available soil water" : focus === "rain" ? "Assumed rain after losses" : "Reference ET × crop coefficient"}</small>
          </div>
          <span className={field.sceneCredit}>AI illustration · schematic flow · not field imagery</span>
        </div>
        <div className={field.sceneReadouts}>
            <button type="button" aria-label="Inspect effective rain" aria-pressed={focus === "rain"} onClick={() => setFocus("rain")}><IconCloudRain /><span>Effective rain<strong>{fmt(input.rain)} <small>mm</small></strong></span></button>
            <button type="button" aria-label="Inspect soil reserve" aria-pressed={focus === "roots"} onClick={() => setFocus("roots")}><IconDroplet /><span>Soil reserve<strong>{fmt(input.reserve)} <small>mm</small></strong></span></button>
            <button type="button" aria-label="Inspect crop ET" aria-pressed={focus === "crop"} onClick={() => setFocus("crop")}><IconSun /><span>Crop ET<strong>{fmt(budget.demand)} <small>mm</small></strong></span></button>
        </div>
        <p className={styles.focusNote}>{notes[focus]}</p>
        <div className={field.stageTimeline}>
          <div className={field.timelineHead}><span className={styles.eyebrow}>Growth stage / reference comparison</span><small>Same inputs · 7-day crop ET</small></div>
          <div className={field.stageButtons} role="group" aria-label="Crop growth stage">
            {CROP_STAGES.map((stage, index) => {
              const result = cropWaterBudget({ ...input, stage: index });
              const maxDemand = Math.max(1, ...profile.kc.map(kc => input.eto * kc * 7));
              const [atlasY, atlasH] = CROP_FRAMES[input.crop][index];
              return <button type="button" key={stage} aria-label={`${stage} Kc ${profile.kc[index].toFixed(2)}`} aria-pressed={input.stage === index} onClick={() => setInput({ ...input, stage: index })}>
                <span className={field.stagePreview} aria-hidden="true" style={{ backgroundImage: `url(${assetRoot}/agriculture-${input.crop}-stages.webp)`, backgroundSize: `100% ${ATLAS_HEIGHT[input.crop] / atlasH * 100}%`, backgroundPosition: `center ${atlasY / (ATLAS_HEIGHT[input.crop] - atlasH) * 100}%` }} />
                <span className={field.stageName}><i>{String(index + 1).padStart(2, "0")}</i><strong>{stage}</strong></span>
                <span className={field.stageDemand}>{fmt(result.demand)} <small>mm</small><em>Kc {profile.kc[index].toFixed(2)}</em></span>
                <span className={field.stageTrack} aria-hidden="true"><i style={{ width: `${result.rainUsed / maxDemand * 100}%`, background: "#2789af" }} /><i style={{ width: `${result.reserveUsed / maxDemand * 100}%`, background: "#448b64" }} /><i style={{ width: `${result.gap / maxDemand * 100}%`, background: "#b64c42" }} /></span>
              </button>;
            })}
          </div>
        </div>
        <div className={styles.budgetReadout} aria-live="polite" aria-atomic="true">
          <div className={styles.budgetHeadline}><span>Uncovered crop ET</span><strong data-testid="budget-gap">{fmt(budget.gap)} <small>mm / 7 days</small></strong></div>
          <div className={styles.budgetTrack} role="img" aria-label={`Crop ET ${fmt(budget.demand)} mm: effective rain covers ${fmt(budget.rainUsed)}, soil reserve covers ${fmt(budget.reserveUsed)}, uncovered ${fmt(budget.gap)}.`}>
            <span style={{ width: `${budget.demand ? budget.rainUsed / budget.demand * 100 : 0}%`, background: "#2789af" }} />
            <span style={{ width: `${budget.demand ? budget.reserveUsed / budget.demand * 100 : 0}%`, background: "#448b64" }} />
            <span className={styles.gapFill} style={{ width: `${budget.demand ? budget.gap / budget.demand * 100 : 0}%` }} />
          </div>
          <div className={styles.budgetLegend}><span><i style={{ background: "#2789af" }} />Rain {fmt(budget.rainUsed)}</span><span><i style={{ background: "#448b64" }} />Reserve {fmt(budget.reserveUsed)}</span><span><i style={{ background: "#b64c42" }} />Gap {fmt(budget.gap)} mm</span></div>
        </div>
      </div>
      <div className={field.controls}>
        <div className={styles.controlHead}><span className={styles.eyebrow}>Scenario inputs</span><button type="button" className={styles.textButton} onClick={() => setInput({ ...DEFAULT_BUDGET })}>Reset</button></div>
        <label className={styles.selectLabel}>Reference crop<select aria-label="Reference crop" value={input.crop} onChange={event => setInput({ ...input, crop: event.target.value as CropKey })}>{Object.entries(CROP_REFERENCE).map(([key, crop]) => <option value={key} key={key}>{crop.name}</option>)}</select></label>
        <div className={field.activeStage}><IconLeaf /><div><span>Selected reference stage</span><strong>{CROP_STAGES[input.stage]}</strong></div><b>{budget.kc.toFixed(2)}<small>Kc</small></b></div>
        {([
          { key: "eto", title: "Reference ET", unit: "mm/day", max: 10, step: .5, Icon: IconSun },
          { key: "rain", title: "Effective rain", unit: "mm / 7 days", max: 70, step: 1, Icon: IconCloudRain },
          { key: "reserve", title: "Usable soil reserve", unit: "mm at start", max: 60, step: 1, Icon: IconDroplet },
        ] as const).map(({ key, title, unit, max, step, Icon }) => <label className={styles.sliderControl} key={key}>
          <span><Icon />{title}<strong>{input[key]} <small>{unit}</small></strong></span>
          <input type="range" aria-label={title} aria-valuetext={`${input[key]} ${unit}`} min={0} max={max} step={step} value={input[key]} onChange={event => setInput({ ...input, [key]: Number(event.target.value) })} style={{ "--range-fill": `${input[key] / max * 100}%` } as CSSProperties} />
        </label>)}
        <div className={styles.formula}><span>Crop ET = reference ET × Kc × 7</span><strong>{input.eto.toFixed(1)} × {budget.kc.toFixed(2)} × 7 = {fmt(budget.demand)} mm</strong><small>{fmt(budget.remainingReserve)} mm reserve not used · {fmt(budget.unusedRain)} mm rain not allocated</small></div>
        <div className={field.balanceSummary}><span>SCENARIO COVERAGE</span><strong>{budget.demand ? Math.round((budget.rainUsed + budget.reserveUsed) / budget.demand * 100) : 0}<small>%</small></strong><p>{budget.demand ? "Of estimated crop ET covered by effective rain and the assumed usable soil reserve." : "No crop ET in this input scenario."}</p><small>Not crop health, yield or irrigation advice.</small></div>
      </div>
    </div>
    <details className={styles.method}><summary>Scenario assumptions and reference</summary><p>Plant shapes, root lengths and particle flows are illustrative, not measured dimensions or a calibrated growth or water-transport model. No irrigation or capillary rise is included. All effective rain and usable reserve are assumed available within the seven-day window; timing and soil capacity are not simulated. Rain not allocated to crop ET is not an estimate of groundwater recharge. A zero gap is not proof of a healthy crop. This is not a watering schedule, drought forecast or crop recommendation.</p><p>{profile.note} Crop varieties, wetting frequency, local climate and field conditions require agronomic calibration. Paddy is not represented because flooding and percolation require additional accounting. <a href={CROP_REFERENCE_URL} target="_blank" rel="noreferrer">FAO-56, Chapter 6, Table 12</a>.</p></details>
  </section>;
}
