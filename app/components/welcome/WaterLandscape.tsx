import type { CSSProperties } from "react";
import geometry from "./landscape.json";
import styles from "./Welcome.module.css";

/** Animated vector artwork, not a data visualisation. No WebGL, video or network assets. */
export function WaterLandscape() {
  const phase = (i: number): CSSProperties => ({ "--delay": `${-(i * 0.73)}s` } as CSSProperties);
  const rechargePoints = [{ x: 235, y: 350 }, { x: 340, y: 300 }, { x: 515, y: 236 }];
  return (
    <svg className={styles.scene} viewBox="0 0 820 700" fill="none" role="img" aria-labelledby="water-landscape-title water-landscape-description">
      <title id="water-landscape-title">Beneath the monsoon</title>
      <desc id="water-landscape-description">An illustrative Andhra Pradesh landscape connects monsoon rain and crop rows with groundwater in rock and sediment. Recharge pulses move down to a cyan water-bearing layer, small measurement points pulse along the water-bearing layer, and an illustrative assessment trace responds. This is not measured data, an actual well map, or a geological cross-section.</desc>
      <defs>
        <linearGradient id="wl-land" x1="160" y1="160" x2="570" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#164e4c"/><stop offset=".5" stopColor="#22695a"/><stop offset="1" stopColor="#083b41"/></linearGradient>
        <linearGradient id="wl-edge" x1="130" y1="130" x2="540" y2="460" gradientUnits="userSpaceOnUse"><stop stopColor="#b2e9bc"/><stop offset=".55" stopColor="#79dbbf"/><stop offset="1" stopColor="#459d93"/></linearGradient>
        <linearGradient id="wl-rock" x1="300" y1="300" x2="360" y2="650" gradientUnits="userSpaceOnUse"><stop stopColor="#426c66" stopOpacity=".48"/><stop offset="1" stopColor="#173f49" stopOpacity=".12"/></linearGradient>
        <linearGradient id="wl-water" x1="200" y1="330" x2="610" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#12b5cb" stopOpacity=".62"/><stop offset=".5" stopColor="#148dba" stopOpacity=".72"/><stop offset="1" stopColor="#124d76" stopOpacity=".48"/></linearGradient>
        <linearGradient id="wl-rain" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8ce7f2" stopOpacity="0"/><stop offset="1" stopColor="#b4f5fa" stopOpacity=".95"/></linearGradient>
        <radialGradient id="wl-glow"><stop stopColor="#39a99d" stopOpacity=".17"/><stop offset="1" stopColor="#39a99d" stopOpacity="0"/></radialGradient>
        <radialGradient id="wl-cloud"><stop stopColor="#86b8b2" stopOpacity=".13"/><stop offset="1" stopColor="#86b8b2" stopOpacity="0"/></radialGradient>
        <pattern id="wl-grid" width="35" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-17)"><path d="M35 0H0V22" stroke="#abdcb2" strokeOpacity=".12" strokeWidth=".6"/></pattern>
        <pattern id="wl-pores" width="19" height="15" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="1.2" fill="#a5f2ff" opacity=".3"/><path d="m11 2 3 4-2 5" stroke="#a5f2ff" strokeWidth=".7" opacity=".25"/></pattern>
        <clipPath id="wl-clip"><path d={geometry.path}/></clipPath>
        <filter id="wl-soft"><feGaussianBlur stdDeviation="2.5"/></filter>
      </defs>

      <ellipse cx="420" cy="405" rx="390" ry="270" fill="url(#wl-glow)"/>
      <g stroke="#73b7b4" strokeOpacity=".14" strokeWidth=".65">
        {[0,1,2,3].map(i => <ellipse key={i} cx="430" cy="555" rx={175+i*57} ry={44+i*17} transform="rotate(-15 430 555)" className={styles.ripple} style={phase(i)}/>)}
        <path d="M90 550 760 370M150 650 745 480" strokeDasharray="3 9"/>
      </g>

      <g className={styles.strata}>
        <path d={geometry.path} transform="translate(0 170)" fill="#0b262f" stroke="#41626b" strokeOpacity=".55" strokeWidth=".8"/>
        {[145,133,121].map(y => <path key={y} d={geometry.path} transform={`translate(0 ${y})`} fill="url(#wl-rock)" stroke="#5f8e8e" strokeOpacity=".23" strokeWidth=".7"/>)}
        <g transform="translate(0 103)">
          <path d={geometry.path} fill="url(#wl-water)" stroke="#71e5f3" strokeOpacity=".9" strokeWidth="1.5"/>
          <path d={geometry.path} fill="url(#wl-pores)"/>
          <path className={styles.aquiferResponse} d={geometry.path} fill="#56d9f0" stroke="#9bf2ff" strokeWidth="2"/>
          <g clipPath="url(#wl-clip)" stroke="#b4f7ff" strokeWidth="1.2">
            {Array.from({length:12},(_,i)=><path key={i} className={styles.current} style={phase(i)} d={`M60 ${180+i*24}Q230 ${130+i*24} 400 ${190+i*24}T790 ${170+i*24}`} strokeOpacity=".48" strokeDasharray="100 25 4 25"/>)}
          </g>
        </g>
        <path d={geometry.path} transform="translate(0 57)" fill="url(#wl-rock)" stroke="#90ada0" strokeOpacity=".45" strokeWidth=".8"/>
        {[38,30,22,14].map(y => <path key={y} d={geometry.path} transform={`translate(0 ${y})`} fill="#0e3638" stroke="#67a397" strokeOpacity=".3" strokeWidth=".65"/>)}
        <path d={geometry.path} fill="url(#wl-land)" stroke="url(#wl-edge)" strokeWidth="1.4"/>
        <g clipPath="url(#wl-clip)">
          <path d={geometry.path} fill="url(#wl-grid)"/>
          {Array.from({length:14},(_,i)=><path key={i} d={`M40 ${150+i*21}Q180 ${80+i*21} 320 ${180+i*21}T700 ${120+i*21}`} stroke="#a3d4ab" strokeOpacity=".15" strokeWidth=".7"/>)}
          {/* Small cultivated parcels keep agriculture visibly tied to the land. */}
          {[{x:270,y:342},{x:437,y:251},{x:596,y:186}].map(({x,y},i)=><g key={i} transform={`translate(${x} ${y}) rotate(-18) skewX(25)`}>
            <rect x="-24" y="-16" width="56" height="34" fill="#6b8956" fillOpacity=".35" stroke="#c4d694" strokeWidth=".8"/>
            {[-10,-2,6,14].map(row=><g key={row} stroke="#c6df98" strokeWidth="1" strokeOpacity=".85">
              <path d={`M-20 ${row}h48`}/>
              {[-14,-2,10,22].map(col=><path key={col} d={`M${col} ${row}v-5m0 3-3-2m3 1 3-3`} strokeWidth=".8"/>)}
            </g>)}
            <path d="M0-16v34" stroke="#254c3e" strokeWidth="2"/>
          </g>)}
          <path d="M280 190C290 245 425 260 457 308S490 339 524 351M480 155C465 205 520 228 557 244S589 275 610 272" stroke="#99e9d8" strokeWidth="2" strokeOpacity=".65"/>
          <path d="M280 190C290 245 425 260 457 308S490 339 524 351M480 155C465 205 520 228 557 244S589 275 610 272" stroke="#9bffdb" strokeWidth="7" strokeOpacity=".16" filter="url(#wl-soft)"/>
          {geometry.nodes.map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="2" fill="#d5f4ba" opacity=".8"/>{i%3===0&&<circle className={styles.signal} style={phase(i)} cx={x} cy={y} r="7" stroke="#c4efaf" strokeWidth=".8"/>}</g>)}
        </g>
      </g>

      {/* Light and small points suggest recharge without adding physical structures. */}
      <g>
        {rechargePoints.map(({x,y},i)=><g key={i} transform={`translate(${x} ${y})`}>
          <circle r="2.5" fill="#d5f4ba" opacity=".85"/>
          <ellipse cy="103" rx="5" ry="2" fill="#c0f6fc" opacity=".8"/>
          <ellipse className={styles.measurementResponse} cy="103" rx="13" ry="5" stroke="#8beefd" strokeWidth="1"/>
          <path className={styles.rechargePulse} d="M0 8c-8 29 8 58 0 90" pathLength="100" stroke="#8fefff" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="7 100"/>
        </g>)}
        <path d="M520 339h45l18 32h114" stroke="#76deef" strokeOpacity=".6" strokeWidth=".7"/>
        <text x="590" y="362" className={styles.waterTableLabel}>WATER TABLE</text>
        <text x="590" y="388" className={styles.waterTableSub}>Recharge beneath the surface</text>
      </g>

      <g className={styles.rain}>
        {geometry.nodes.filter((_,i)=>i%2===0).map(([x,y],i)=><g key={i} className={styles.rainDrop}><path d={`M${x} ${y-110-(i%3)*12}v42`} stroke="url(#wl-rain)" strokeWidth="1.6"/><circle cx={x} cy={y-67-(i%3)*12} r="1.6" fill="#cbf8ff" opacity=".85"/></g>)}
      </g>
      <g className={styles.clouds}>
        <ellipse cx="450" cy="132" rx="220" ry="64" fill="url(#wl-cloud)"/>
        <ellipse cx="320" cy="205" rx="190" ry="62" fill="url(#wl-cloud)"/>
        <ellipse cx="555" cy="96" rx="165" ry="52" fill="url(#wl-cloud)"/>
      </g>

      <g className={styles.sceneLabels}>
        <path d="M526 103h90l22-22h64"/><circle cx="526" cy="103" r="2"/>
        <text x="605" y="67">MONSOON &amp; RECHARGE</text><text x="605" y="101" className={styles.labelSub}>Rain above. Recharge below.</text>
        <path d="M180 317h-61l-23-23H32"/><circle cx="180" cy="317" r="2"/>
        <text x="18" y="270">FIELDS &amp; SOIL MOISTURE</text><text x="18" y="286" className={styles.labelSub}>The water that supports a season</text>
        <path d="M440 403h100l28 37h192"/><circle cx="440" cy="403" r="2"/>
        <text x="560" y="427" className={styles.groundwaterLabel}>GROUNDWATER &amp; ASSESSMENT</text><text x="560" y="456" className={styles.labelSub}>Water held in rock and sediment</text>
        <text x="500" y="333" transform="rotate(-24 500 333)" className={styles.stateLabel}>ANDHRA PRADESH</text>
        <text x="644" y="293" transform="rotate(-24 644 293)" className={styles.seaLabel}>BAY OF BENGAL</text>
      </g>
      <g transform="translate(448 508)" className={styles.assessment}>
        <path d="M0 0h266M0 107h266" stroke="#6bafb9" strokeOpacity=".4" strokeWidth=".7"/>
        <text y="19" className={styles.assessmentTitle}>READ THE WATER BELOW</text>
        <text y="36" className={styles.assessmentNote}>Observation → assessment → outlook</text>
        <path d="M0 87h260M0 51v36" stroke="#648c9d" strokeWidth=".6"/>
        <path d="m7 72 25 3 25-15 25 6 25-12 25 8 25-11 25 8" stroke="#7ce4f4" strokeOpacity=".24" strokeWidth="1.5"/>
        <path className={styles.assessmentTrace} pathLength="100" d="m7 72 25 3 25-15 25 6 25-12 25 8 25-11 25 8" stroke="#9af1fc" strokeWidth="1.8"/>
        <path d="m182 59 25-5 25 4 25-13v28l-25-7-25 4-25-11Z" fill="#56bdcf" fillOpacity=".12"/>
        <path d="m182 59 25 3 25 0 25-4" stroke="#b8d4bd" strokeWidth="1.2" strokeDasharray="3 4"/>
        <text y="100" className={styles.assessmentNote}>ILLUSTRATIVE TRACE · NO LIVE READINGS</text>
      </g>
      <g transform="translate(744 566)" stroke="#83aaa8" strokeWidth=".8"><path d="M0 20V-20l-4 9m4-9 4 9M-10 0h20"/><text y="-30" textAnchor="middle" fill="#83aaa8" stroke="none" fontSize="9">N</text></g>
    </svg>
  );
}
