import type { CSSProperties } from "react";
import geometry from "./landscape.json";
import styles from "./Welcome.module.css";

/** Animated vector artwork, not a data visualisation. No WebGL, video or network assets. */
export function WaterLandscape() {
  const phase = (i: number): CSSProperties => ({ "--delay": `${-(i * 0.73)}s` } as CSSProperties);
  return (
    <svg className={styles.scene} viewBox="0 0 820 700" fill="none" role="img" aria-labelledby="water-landscape-title water-landscape-description">
      <title id="water-landscape-title">Beneath the monsoon</title>
      <desc id="water-landscape-description">An artistic outline of Andhra Pradesh floats above layers of earth and groundwater, with falling rain and ripples. This scene illustrates the water cycle; it is not measured data.</desc>
      <defs>
        <linearGradient id="wl-land" x1="160" y1="160" x2="570" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#164e4c"/><stop offset=".5" stopColor="#22695a"/><stop offset="1" stopColor="#083b41"/></linearGradient>
        <linearGradient id="wl-edge" x1="130" y1="130" x2="540" y2="460" gradientUnits="userSpaceOnUse"><stop stopColor="#b2e9bc"/><stop offset=".55" stopColor="#79dbbf"/><stop offset="1" stopColor="#459d93"/></linearGradient>
        <linearGradient id="wl-rock" x1="300" y1="300" x2="360" y2="650" gradientUnits="userSpaceOnUse"><stop stopColor="#426c66" stopOpacity=".48"/><stop offset="1" stopColor="#173f49" stopOpacity=".12"/></linearGradient>
        <linearGradient id="wl-water" x1="200" y1="330" x2="610" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#48d3d0" stopOpacity=".28"/><stop offset=".5" stopColor="#0f797f" stopOpacity=".54"/><stop offset="1" stopColor="#063e54" stopOpacity=".2"/></linearGradient>
        <linearGradient id="wl-rain" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a3e5d9" stopOpacity="0"/><stop offset="1" stopColor="#a3e5d9" stopOpacity=".65"/></linearGradient>
        <radialGradient id="wl-glow"><stop stopColor="#39a99d" stopOpacity=".17"/><stop offset="1" stopColor="#39a99d" stopOpacity="0"/></radialGradient>
        <radialGradient id="wl-cloud"><stop stopColor="#86b8b2" stopOpacity=".13"/><stop offset="1" stopColor="#86b8b2" stopOpacity="0"/></radialGradient>
        <pattern id="wl-grid" width="35" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-17)"><path d="M35 0H0V22" stroke="#abdcb2" strokeOpacity=".12" strokeWidth=".6"/></pattern>
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
          <path d={geometry.path} fill="url(#wl-water)" stroke="#5de0d5" strokeOpacity=".6" strokeWidth="1"/>
          <g clipPath="url(#wl-clip)" stroke="#8be9d8" strokeWidth=".7">
            {Array.from({length:12},(_,i)=><path key={i} className={styles.current} style={phase(i)} d={`M60 ${180+i*24}Q230 ${130+i*24} 400 ${190+i*24}T790 ${170+i*24}`} strokeOpacity=".25" strokeDasharray="100 25 4 25"/>)}
          </g>
        </g>
        <path d={geometry.path} transform="translate(0 57)" fill="url(#wl-rock)" stroke="#90ada0" strokeOpacity=".45" strokeWidth=".8"/>
        {[38,30,22,14].map(y => <path key={y} d={geometry.path} transform={`translate(0 ${y})`} fill="#0e3638" stroke="#67a397" strokeOpacity=".3" strokeWidth=".65"/>)}
        <path d={geometry.path} fill="url(#wl-land)" stroke="url(#wl-edge)" strokeWidth="1.4"/>
        <g clipPath="url(#wl-clip)">
          <path d={geometry.path} fill="url(#wl-grid)"/>
          {Array.from({length:14},(_,i)=><path key={i} d={`M40 ${150+i*21}Q180 ${80+i*21} 320 ${180+i*21}T700 ${120+i*21}`} stroke="#a3d4ab" strokeOpacity=".15" strokeWidth=".7"/>)}
          <path d="M280 190C290 245 425 260 457 308S490 339 524 351M480 155C465 205 520 228 557 244S589 275 610 272" stroke="#99e9d8" strokeWidth="2" strokeOpacity=".65"/>
          <path d="M280 190C290 245 425 260 457 308S490 339 524 351M480 155C465 205 520 228 557 244S589 275 610 272" stroke="#9bffdb" strokeWidth="7" strokeOpacity=".16" filter="url(#wl-soft)"/>
          {geometry.nodes.map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="2" fill="#d5f4ba" opacity=".8"/>{i%3===0&&<circle className={styles.signal} style={phase(i)} cx={x} cy={y} r="7" stroke="#c4efaf" strokeWidth=".8"/>}</g>)}
        </g>
      </g>

      <g className={styles.rain}>
        {geometry.nodes.filter((_,i)=>i%2===0).map(([x,y],i)=><g key={i} style={phase(i)} className={styles.rainDrop}><path d={`M${x} ${y-100}v34`} stroke="url(#wl-rain)" strokeWidth=".9"/><circle cx={x} cy={y-65} r="1" fill="#c9f5e3" opacity=".65"/></g>)}
      </g>
      <g className={styles.clouds}>
        <ellipse cx="450" cy="132" rx="220" ry="64" fill="url(#wl-cloud)"/>
        <ellipse cx="320" cy="205" rx="190" ry="62" fill="url(#wl-cloud)"/>
        <ellipse cx="555" cy="96" rx="165" ry="52" fill="url(#wl-cloud)"/>
      </g>

      <g className={styles.sceneLabels}>
        <path d="M526 103h90l22-22h64"/><circle cx="526" cy="103" r="2"/>
        <text x="641" y="67">THE MONSOON</text><text x="641" y="95" className={styles.labelSub}>Where it begins</text>
        <path d="M180 317h-61l-23-23H32"/><circle cx="180" cy="317" r="2"/>
        <text x="32" y="280">THE LAND</text><text x="32" y="310" className={styles.labelSub}>A season of possibility</text>
        <path d="M524 440h65l25 24h105"/><circle cx="524" cy="440" r="2"/>
        <text x="617" y="450">THE AQUIFER</text><text x="617" y="480" className={styles.labelSub}>A hidden reserve</text>
        <text x="500" y="333" transform="rotate(-24 500 333)" className={styles.stateLabel}>ANDHRA PRADESH</text>
        <text x="580" y="375" transform="rotate(-24 580 375)" className={styles.seaLabel}>BAY OF BENGAL</text>
      </g>
      <g transform="translate(744 566)" stroke="#83aaa8" strokeWidth=".8"><path d="M0 20V-20l-4 9m4-9 4 9M-10 0h20"/><text y="-30" textAnchor="middle" fill="#83aaa8" stroke="none" fontSize="9">N</text></g>
    </svg>
  );
}
