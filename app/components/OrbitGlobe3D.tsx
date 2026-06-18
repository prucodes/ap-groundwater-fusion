"use client";

import { useEffect, useRef } from "react";

/* Real 3D Earth + NASA GRACE-FO satellite for the sidebar (raw three.js,
   dynamically imported so it never runs during SSR). The SVG OrbitGlobe is
   kept on disk — swap the import in AppShell to switch back. WebGL does not
   render in headless screenshots, so this is verified visually in a browser. */
export function OrbitGlobe3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      if (disposed || !host) return;

      const W = host.clientWidth || 200;
      const H = 162;
      const R = 1.42;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
      camera.position.set(0, 0, 5.6);
      camera.lookAt(0, -0.45, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      host.appendChild(renderer.domElement);

      const root = new THREE.Group();
      root.rotation.z = 0.32;
      scene.add(root);

      // Earth core + graticule + atmosphere
      root.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 36), new THREE.MeshBasicMaterial({ color: 0x0a2c45 })));
      root.add(new THREE.Mesh(new THREE.SphereGeometry(R, 36, 24), new THREE.MeshBasicMaterial({ color: 0x12b5cb, wireframe: true, transparent: true, opacity: 0.3 })));
      root.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 32, 24), new THREE.MeshBasicMaterial({ color: 0x1f8ab5, transparent: true, opacity: 0.07, side: THREE.BackSide })));

      const toXYZ = (lat: number, lng: number, rad: number) => {
        const phi = ((90 - lat) * Math.PI) / 180;
        const th = ((lng + 180) * Math.PI) / 180;
        return new THREE.Vector3(-rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th));
      };

      // Andhra Pradesh marker
      const apPos = toXYZ(16.0, 80.0, R * 1.01);
      const ap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      ap.position.copy(apPos);
      root.add(ap);
      const apHalo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.22 }));
      apHalo.position.copy(apPos);
      root.add(apHalo);

      // Sensing beam (GRACE measuring AP) — endpoints updated each frame
      const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5 }));
      root.add(beam);

      // Stars
      const starPts: number[] = [];
      for (let i = 0; i < 260; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(13 + Math.random() * 9);
        starPts.push(v.x, v.y, v.z);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPts, 3));
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.05, transparent: true, opacity: 0.65 }));
      scene.add(stars);

      // GRACE-FO satellite on an inclined orbit
      const orbit = new THREE.Group();
      orbit.rotation.x = 0.66;
      orbit.rotation.z = 0.2;
      scene.add(orbit);
      const RO = 2.2;
      const ringPts: Array<InstanceType<typeof THREE.Vector3>> = [];
      for (let a = 0; a <= 128; a++) {
        const t = (a / 128) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(t) * RO, 0, Math.sin(t) * RO));
      }
      orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x12b5cb, transparent: true, opacity: 0.32 })));

      const sat = new THREE.Group();
      orbit.add(sat);
      sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.17), new THREE.MeshBasicMaterial({ color: 0xeaf3ff })));
      const panelMat = new THREE.MeshBasicMaterial({ color: 0x1f8ab5, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const pL = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), panelMat);
      pL.position.x = -0.26;
      sat.add(pL);
      const pR = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), panelMat);
      pR.position.x = 0.26;
      sat.add(pR);

      const tag = tagRef.current;
      const tmp = new THREE.Vector3();
      let t = 0;

      const frame = () => {
        if (disposed) return;
        t += 0.0045;
        root.rotation.y += 0.0026;
        stars.rotation.y += 0.0004;

        const ang = t * 1.5;
        sat.position.set(Math.cos(ang) * RO, 0, Math.sin(ang) * RO);
        sat.rotation.y = -ang;

        const s = 1 + 0.2 * Math.sin(t * 6);
        apHalo.scale.set(s, s, s);

        // Update sensing beam from satellite (world) to AP (world)
        const satW = sat.getWorldPosition(new THREE.Vector3());
        const apW = ap.getWorldPosition(new THREE.Vector3());
        beamGeo.setFromPoints([satW.clone(), apW.clone()]);
        (beam.material as { opacity: number }).opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5));

        // Position the GRACE-FO HTML label at the satellite
        if (tag) {
          satW.project(camera);
          const facing = sat.getWorldPosition(tmp).normalize().dot(camera.position.clone().normalize());
          if (facing > -0.2 && satW.z < 1) {
            tag.style.display = "block";
            tag.style.left = `${(satW.x * 0.5 + 0.5) * W + 8}px`;
            tag.style.top = `${(-satW.y * 0.5 + 0.5) * H - 6}px`;
          } else {
            tag.style.display = "none";
          }
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      frame();

      const onResize = () => {
        const w = host.clientWidth || W;
        camera.aspect = w / H;
        camera.updateProjectionMatrix();
        renderer.setSize(w, H);
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, []);

  return (
    <div className="orbitGlobe3d">
      <div ref={hostRef} className="og3dHost" />
      <span ref={tagRef} className="og3dTag">GRACE-FO</span>
      <div className="og3dCaption"><span className="og3dDot" /> NASA GRACE-FO · live orbit</div>
    </div>
  );
}
