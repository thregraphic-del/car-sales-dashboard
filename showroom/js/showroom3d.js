/* =====================================================================
   3D SHOWROOM — Three.js studio viewer (loaded lazily from CDN).
   ---------------------------------------------------------------------
   • If the trim has a licensed GLB/GLTF (trim.asset.model3d) it is loaded.
   • Otherwise a procedural studio representation (proportions by body
     style, real paint colour) is shown and labelled as such in the UI.
   • If WebGL or the CDN is unavailable, a clearly-labelled 2D fallback
     is shown — the dashboard never depends on the 3D layer.
   API (window.Showroom): apply(state) · view(name) · spin(on) · setActive(on)
   ===================================================================== */
(async function(){
  const canvas = document.getElementById('car-canvas');
  const stage  = document.getElementById('stage');
  function webglOK(){ try{ const c=document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2')||c.getContext('webgl'))); }catch(e){ return false; } }
  if(!webglOK()){ window.showFallback && window.showFallback('webgl-unavailable'); return; }
  let THREE, OrbitControls, RoomEnvironment;
  try{
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
  }catch(err){
    console.warn('[Showroom] 3D libraries unavailable:', err && err.message);
    window.showFallback && window.showFallback('cdn'); return;
  }
  initShowroom(THREE, OrbitControls, RoomEnvironment);

  function initShowroom(THREE, OrbitControls, RoomEnvironment){
    const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(28, 2, 0.1, 120);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.055;
    controls.enablePan = true; controls.screenSpacePanning = true; controls.panSpeed = 0.6; controls.rotateSpeed = 0.65; controls.zoomSpeed = 0.7;
    controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.49;
    controls.minDistance = 6.5; controls.maxDistance = 24;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.45;
    const TARGET = new THREE.Vector3(0, 1.3, 0);
    controls.target.copy(TARGET);

    /* ---- Studio lighting: key / fill / rim / ambient ---- */
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdfe4, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(4, 9, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {left:-4.5, right:4.5, top:4.5, bottom:-4.5, near:1, far:25});
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xf2f5ff, 0.75); fill.position.set(-6, 4, -2); scene.add(fill);
    const rim  = new THREE.DirectionalLight(0xffffff, 1.5);  rim.position.set(-3, 5, -8); scene.add(rim);

    /* ---- Showroom floor ---- */
    function radialTexture(stops, size=256){
      const c = document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d');
      const gr = g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
      stops.forEach(([o,col])=>gr.addColorStop(o,col)); g.fillStyle=gr; g.fillRect(0,0,size,size);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const PR = 3.55;
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR, 0.06, 128),
      new THREE.MeshStandardMaterial({color:0xeceef1, roughness:.32, metalness:.08, transparent:true, opacity:.88}));
    platform.position.y = -0.03; platform.receiveShadow = true; platform.renderOrder = 1; scene.add(platform);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(PR, 0.012, 12, 160), new THREE.MeshStandardMaterial({color:0xb89b5e, metalness:1, roughness:.25}));
    edge.rotation.x = Math.PI/2; scene.add(edge);
    const inner = new THREE.Mesh(new THREE.RingGeometry(PR-0.32, PR-0.31, 160), new THREE.MeshBasicMaterial({color:0xb89b5e, transparent:true, opacity:.35}));
    inner.rotation.x = -Math.PI/2; inner.position.y = 0.002; inner.renderOrder = 3; scene.add(inner);
    const outer = new THREE.Mesh(new THREE.RingGeometry(PR+0.01, 18, 128),
      new THREE.MeshBasicMaterial({color:0xeef0f3, transparent:true, depthWrite:false,
        alphaMap: radialTexture([[0,'#fff'],[PR/18,'#fff'],[0.55,'#444'],[1,'#000']])}));
    outer.rotation.x = -Math.PI/2; outer.position.y = -0.004; scene.add(outer);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.MeshBasicMaterial({map: radialTexture([[0,'rgba(0,0,0,.62)'],[.45,'rgba(0,0,0,.34)'],[1,'rgba(0,0,0,0)']]), transparent:true, depthWrite:false}));
    contact.rotation.x = -Math.PI/2; contact.position.y = 0.004; contact.renderOrder = 2; scene.add(contact);

    /* ---- Procedural vehicle ---- */
    const STYLES = {
      luxurySUV:{L:5.05,W:2.0,clr:.30,R:.41,wb:3.0,off:.02,hood:1.13,belt:1.18,tail:1.14,roof:1.86,A:.98,B:.24,C:-2.12,D:-2.36},
      sportSUV: {L:4.92,W:1.98,clr:.28,R:.40,wb:2.98,off:.02,hood:1.05,belt:1.1,tail:1.05,roof:1.72,A:.86,B:.02,C:-1.6,D:-2.3},
      compactSUV:{L:4.40,W:1.92,clr:.26,R:.38,wb:2.68,off:.02,hood:1.0,belt:1.07,tail:1.02,roof:1.63,A:.78,B:.02,C:-1.45,D:-2.02},
      boxy:     {L:4.95,W:2.0,clr:.34,R:.42,wb:3.02,off:.04,hood:1.18,belt:1.22,tail:1.22,roof:1.97,A:1.05,B:.72,C:-2.3,D:-2.38},
      boxyLong: {L:5.35,W:2.0,clr:.34,R:.42,wb:3.02,off:.22,hood:1.18,belt:1.22,tail:1.22,roof:1.97,A:1.25,B:.92,C:-2.5,D:-2.58},
      gclass:   {L:4.82,W:1.98,clr:.32,R:.42,wb:2.9,off:.02,hood:1.2,belt:1.25,tail:1.25,roof:1.98,A:.95,B:.82,C:-2.3,D:-2.33,spare:true},
      sedan:    {L:5.2,W:1.95,clr:.18,R:.36,wb:3.1,off:.05,hood:.92,belt:.99,tail:.99,roof:1.49,A:.66,B:-.3,C:-1.35,D:-1.96},
      gt:       {L:4.98,W:1.96,clr:.15,R:.36,wb:2.96,off:.02,hood:.78,belt:.9,tail:.94,roof:1.39,A:.58,B:-.38,C:-1.15,D:-2.2},
      coupe:    {L:4.52,W:1.86,clr:.14,R:.35,wb:2.45,off:-.12,hood:.74,belt:.88,tail:.96,roof:1.30,A:.5,B:-.32,C:-.78,D:-2.08},
      wagon:    {L:5.0,W:1.95,clr:.16,R:.37,wb:2.93,off:.02,hood:.88,belt:.95,tail:.99,roof:1.46,A:.62,B:-.3,C:-2.1,D:-2.36},
      // v3 body types
      compactSedan:{L:4.45,W:1.75,clr:.16,R:.33,wb:2.6,off:.02,hood:.86,belt:.96,tail:.98,roof:1.47,A:.62,B:-.18,C:-1.12,D:-1.66},
      hatch:    {L:4.05,W:1.76,clr:.15,R:.33,wb:2.55,off:.02,hood:.84,belt:.94,tail:1.0,roof:1.5,A:.62,B:-.12,C:-1.58,D:-1.9},
      crossover:{L:4.45,W:1.82,clr:.22,R:.36,wb:2.64,off:.02,hood:.98,belt:1.04,tail:1.02,roof:1.6,A:.76,B:.02,C:-1.48,D:-1.98},
      suv:      {L:4.72,W:1.88,clr:.24,R:.38,wb:2.75,off:.02,hood:1.02,belt:1.08,tail:1.05,roof:1.7,A:.84,B:.06,C:-1.72,D:-2.2},
      largeSUV: {L:5.1,W:2.0,clr:.27,R:.41,wb:2.95,off:.02,hood:1.12,belt:1.16,tail:1.13,roof:1.88,A:.98,B:.22,C:-2.16,D:-2.4},
      pickup:   {L:5.35,W:1.9,clr:.3,R:.4,wb:3.1,off:.1,hood:1.1,belt:1.14,tail:1.14,roof:1.82,A:1.02,B:.46,C:-.32,D:-.44,bed:true},
      mpv:      {L:5.15,W:1.99,clr:.19,R:.37,wb:3.08,off:.06,hood:1.02,belt:1.1,tail:1.12,roof:1.92,A:1.35,B:.62,C:-2.3,D:-2.46},
      van:      {L:5.3,W:1.95,clr:.2,R:.37,wb:3.2,off:.25,hood:1.08,belt:1.14,tail:1.2,roof:2.2,A:1.7,B:1.2,C:-2.48,D:-2.55}
    };
    const TRIM = {
      top:{trim:{color:0xd8dadd, metalness:1, roughness:.12}, rim:{color:0xd2d4d8, metalness:1, roughness:.18}},
      dyn:{trim:{color:0x0c0c0d, metalness:.6, roughness:.22}, rim:{color:0x2b2d31, metalness:.9, roughness:.3}},
      std:{trim:{color:0xa9acb1, metalness:.9, roughness:.35}, rim:{color:0xb7bac0, metalness:1, roughness:.3}}
    };
    const RIM_RATIO = {21:.60, 22:.655, 23:.71};

    let car=null, mirror=null, mats=null, cur={};
    const tweens = [];
    const easeIO = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    function tween(dur, fn, done){ tweens.push({t0:performance.now(), dur, fn, done}); }

    function makeMats(s){
      return {
        paint: new THREE.MeshPhysicalMaterial({color:new THREE.Color(s.color), metalness:.55, roughness:.26, clearcoat:1, clearcoatRoughness:.04}),
        glass: new THREE.MeshPhysicalMaterial({color:0x0a0c0f, metalness:.2, roughness:.04, clearcoat:1, clearcoatRoughness:.02}),
        roof:  new THREE.MeshPhysicalMaterial({color:0x0b0b0c, metalness:.4, roughness:.18, clearcoat:1}),
        trim:  new THREE.MeshStandardMaterial(TRIM[s.pkg].trim),
        rim:   new THREE.MeshStandardMaterial(TRIM[s.pkg].rim),
        dark:  new THREE.MeshStandardMaterial({color:0x121314, roughness:.55, metalness:.2}),
        tire:  new THREE.MeshStandardMaterial({color:0x161616, roughness:.88, metalness:0}),
        barrel:new THREE.MeshStandardMaterial({color:0x1c1d20, roughness:.5, metalness:.6}),
        head:  new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xeaf2ff, emissiveIntensity:1.4, roughness:.1}),
        tail:  new THREE.MeshStandardMaterial({color:0x5a0008, emissive:0xb3001b, emissiveIntensity:1.1, roughness:.2})
      };
    }
    function paintProps(colorId){
      const light = colorId==='white'||colorId==='silver';
      return light ? {metalness:colorId==='white'?.15:.7, roughness:colorId==='white'?.32:.28} : {metalness:.55, roughness:.24};
    }

    function buildWheel(p, size, m){
      const g = new THREE.Group();
      const R = p.R, tw = .27, Ri = R*RIM_RATIO[size];
      const prof = [[Ri,-tw/2],[R-.05,-tw/2],[R,-tw/2+.05],[R,tw/2-.05],[R-.05,tw/2],[Ri,tw/2]].map(([x,y])=>new THREE.Vector2(x,y));
      const tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), m.tire); tire.rotation.x = Math.PI/2; g.add(tire);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(Ri, Ri, tw*.9, 48, 1, true), m.barrel); barrel.rotation.x = Math.PI/2; g.add(barrel);
      const back = new THREE.Mesh(new THREE.CircleGeometry(Ri, 40), m.barrel); back.position.z = tw/2-.09; g.add(back);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(Ri-.012, .016, 10, 64), m.rim); lip.position.z = tw/2-.01; g.add(lip);
      const spokes = 10;
      for(let i=0;i<spokes;i++){
        const s = new THREE.Mesh(new THREE.BoxGeometry(Ri*.9, .038, .03), m.rim);
        const a = i/spokes*Math.PI*2;
        s.position.set(Math.cos(a)*Ri*.47, Math.sin(a)*Ri*.47, tw/2-.03); s.rotation.z = a; g.add(s);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(Ri*.2, Ri*.22, .05, 24), m.rim); hub.rotation.x = Math.PI/2; hub.position.z = tw/2-.025; g.add(hub);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(Ri*.1, Ri*.1, .052, 20), m.dark); cap.rotation.x = Math.PI/2; cap.position.z = tw/2-.02; g.add(cap);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(Ri*.55, Ri*.35, .06), m.dark); cal.position.set(Ri*.55, Ri*.2, tw/2-.12); g.add(cal);
      return g;
    }

    function buildCar(s){
      const p = STYLES[s.style] || STYLES.suv;
      const m = makeMats(s); Object.assign(m.paint, paintProps(s.colorId));
      const group = new THREE.Group(); group.userData.p = p;
      const L2 = p.L/2, W = p.W, bt = .06, bs = .05, yb = p.clr, AR = p.R + .06;
      const xf = p.wb/2 + p.off, xr = -p.wb/2 + p.off, ay = p.R;

      // Lower body (side-profile extrusion with wheel arches)
      const sh = new THREE.Shape();
      sh.moveTo(-L2+.2, yb);
      sh.lineTo(xr-AR, yb); sh.lineTo(xr-AR, ay); sh.absarc(xr, ay, AR, Math.PI, 0, true); sh.lineTo(xr+AR, yb);
      sh.lineTo(xf-AR, yb); sh.lineTo(xf-AR, ay); sh.absarc(xf, ay, AR, Math.PI, 0, true); sh.lineTo(xf+AR, yb);
      sh.lineTo(L2-.22, yb);
      sh.quadraticCurveTo(L2, yb, L2, yb+.22);
      sh.lineTo(L2, p.hood-.14);
      sh.quadraticCurveTo(L2, p.hood, L2-.2, p.hood);
      sh.lineTo(p.A, p.belt);
      sh.lineTo(p.D, p.belt);
      sh.lineTo(-L2+.14, p.tail);
      sh.quadraticCurveTo(-L2, p.tail, -L2, p.tail-.16);
      sh.lineTo(-L2, yb+.24);
      sh.quadraticCurveTo(-L2, yb, -L2+.2, yb);
      const depth = W - 2*bt;
      const bodyGeo = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled:true, bevelThickness:bt, bevelSize:bs, bevelSegments:5, curveSegments:28});
      bodyGeo.translate(0,0,-depth/2);
      const body = new THREE.Mesh(bodyGeo, m.paint); group.add(body);

      // Glasshouse
      const gw = W*.8, gs = new THREE.Shape();
      const k = .16, lerp=(a,b,t)=>a+(b-a)*t;
      const len1 = Math.hypot(p.B-p.A, p.roof-p.belt), t1 = 1-Math.min(.4,k/len1);
      const len2 = Math.hypot(p.D-p.C, p.belt-p.roof), t2 = Math.min(.4,k/len2);
      gs.moveTo(p.A, p.belt-.02);
      gs.lineTo(lerp(p.A,p.B,t1), lerp(p.belt,p.roof,t1));
      gs.quadraticCurveTo(p.B, p.roof, p.B-k, p.roof);
      gs.lineTo(p.C+k, p.roof);
      gs.quadraticCurveTo(p.C, p.roof, lerp(p.C,p.D,t2), lerp(p.roof,p.belt,t2));
      gs.lineTo(p.D, p.belt-.02);
      gs.lineTo(p.A, p.belt-.02);
      const gGeo = new THREE.ExtrudeGeometry(gs, {depth:gw, bevelEnabled:true, bevelThickness:.07, bevelSize:.035, bevelSegments:4, curveSegments:20});
      gGeo.translate(0,0,-gw/2);
      group.add(new THREE.Mesh(gGeo, m.glass));

      // Roof panel (contrast roof on Range Rover / Defender when paint is light)
      const contrast = (s.brand==='Range Rover'||s.brand==='Defender') && s.colorId!=='black';
      const rs = new THREE.Shape(), rw = gw*.98;
      rs.moveTo(p.B-k-.02, p.roof+.02); rs.lineTo(p.C+k+.02, p.roof+.02); rs.lineTo(p.C+k+.06, p.roof+.055); rs.lineTo(p.B-k-.06, p.roof+.055); rs.lineTo(p.B-k-.02, p.roof+.02);
      const rGeo = new THREE.ExtrudeGeometry(rs, {depth:rw, bevelEnabled:true, bevelThickness:.05, bevelSize:.03, bevelSegments:3});
      rGeo.translate(0,0,-rw/2);
      const roof = new THREE.Mesh(rGeo, contrast?m.roof:m.paint); roof.userData.roof = true; group.add(roof);

      const box = (w,h,d,mat,x,y,z)=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); b.position.set(x,y,z); group.add(b); return b; };
      const fx = L2+bs;
      // Front: grille, headlights, lower intake
      box(.03, (p.hood-yb)*.3, W*.44, m.trim, fx-.005, p.hood-.34, 0);
      box(.032, (p.hood-yb)*.24, W*.40, m.dark, fx, p.hood-.34, 0);
      [-1,1].forEach(sd=>{ box(.04,.055,.46,m.head,fx-.01,p.hood-.13,sd*(W/2-.36)); box(.035,.014,.4,m.head,fx-.005,p.hood-.2,sd*(W/2-.38)); });
      box(.03,.07,W*.72,m.dark,fx-.01,yb+.16,0);
      // Pickup: open cargo bed (dark recessed floor + bulkhead behind the cab)
      if(p.bed){ const bedL = (p.D-.06) - (-L2+.1); box(bedL,.03,W-.22,m.dark,(p.D-.06-L2+.1)/2,p.tail+.035,0); box(.05,.16,W-.2,m.paint,p.D-.03,p.tail+.08,0); }
      // Rear: full-width tail light, corners, diffuser
      const rx = -L2-bs;
      box(.03,.04,W*.86,m.tail,rx+.01,p.tail-.16,0);
      [-1,1].forEach(sd=>box(.03,.2,.09,m.tail,rx+.01,p.tail-.24,sd*(W/2-.1)));
      box(.03,.08,W*.7,m.dark,rx+.01,yb+.14,0);
      // Sides: sill trim, belt chrome, mirrors, door lines, handles
      [-1,1].forEach(sd=>{
        const z = sd*(W/2+.002);
        box(xf-xr-2*AR-.1,.05,.02,m.trim,(xf+xr)/2,yb+.07,z);
        box(p.A-p.D-.1,.022,.02,m.trim,(p.A+p.D)/2,p.belt+.01,sd*(gw/2+.075));
        box(.24,.13,.2,contrast?m.roof:m.paint,p.A-.14,p.belt+.1,sd*(W/2+.07));
        const doorX = [(p.A+p.D)/2 + .15, p.A-.08];
        doorX.forEach(dx=>box(.01,p.belt-yb-.2,.006,m.dark,dx,(p.belt+yb)/2+.03,z));
        box(.16,.022,.02,m.trim,(p.A+p.D)/2+.45,p.belt-.16,z+sd*.004);
        box(.16,.022,.02,m.trim,p.D+.55,p.belt-.16,z+sd*.004);
      });
      // Chassis block hides see-through at the arches
      box(p.wb+.9, ay+AR-yb, W-.62, m.dark, p.off, (yb+ay+AR)/2-.04, 0);
      // Spare wheel (Defender / G-Class)
      if(p.spare){
        const sp = buildWheel(p, s.wheel, m); sp.rotation.y = -Math.PI/2; sp.position.set(-L2-bs-.1, (p.tail+yb)/2+.1, 0); sp.scale.setScalar(.85); group.add(sp);
        const cov = new THREE.Mesh(new THREE.CylinderGeometry(p.R*.9,p.R*.9,.08,48), m.paint); cov.rotation.z = Math.PI/2; cov.position.copy(sp.position).add(new THREE.Vector3(-.1,0,0)); group.add(cov);
      }
      // Wheels
      const wheels = new THREE.Group(); wheels.userData.wheels = true; group.add(wheels);
      [[xf,1],[xr,1],[xf,-1],[xr,-1]].forEach(([x,sd])=>{
        const w = buildWheel(p, s.wheel, m);
        w.position.set(x, ay, sd*(W/2-.135-.025));
        if(sd<0) w.rotation.y = Math.PI;
        wheels.add(w);
      });

      group.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      return {group, mats:m, p};
    }

    function makeMirror(src){
      const mr = src.clone(); mr.scale.y = -1;
      mr.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; } });
      return mr;
    }
    function setOpacity(m, v){
      Object.values(m).forEach(mt=>{ const t = v<1; if(mt.transparent!==t){ mt.transparent=t; mt.needsUpdate=true; } mt.opacity=v; });
    }
    function dispose(g){ g.traverse(o=>{ if(o.isMesh) o.geometry.dispose(); }); }
    function fitContact(p){ contact.scale.set(p.L*1.28, p.W*1.75, 1); }

    function mount(s, animate){
      const built = buildCar(s);
      const next = built.group, nextMirror = makeMirror(next);
      const oldCar = car, oldMirror = mirror, oldMats = mats;
      car = next; mirror = nextMirror; mats = built.mats;
      scene.add(car); scene.add(mirror); fitContact(built.p);
      if(!animate) return;
      setOpacity(mats, 0);
      car.position.y = .12; mirror.position.y = -.12;
      tween(750, t=>{ const e=easeIO(t); setOpacity(built.mats, e); car.position.y = .12*(1-e); mirror.position.y = -car.position.y; }, ()=>setOpacity(built.mats,1));
      if(oldCar){
        tween(380, t=>{ setOpacity(oldMats, 1-t); oldCar.position.y = -.06*t; oldMirror.position.y = .06*t; }, ()=>{ scene.remove(oldCar); scene.remove(oldMirror); dispose(oldCar); Object.values(oldMats).forEach(x=>x.dispose()); });
      }
    }

    let gltfKey = null;
    function loadGLB(url){
      if(gltfKey===url) return; gltfKey = url;
      import('three/addons/loaders/GLTFLoader.js').then(({GLTFLoader})=>{
        new GLTFLoader().load(url, gltf=>{
          if(gltfKey!==url) return;
          const obj = gltf.scene; const bb = new THREE.Box3().setFromObject(obj); const size = bb.getSize(new THREE.Vector3());
          obj.scale.setScalar(5/Math.max(size.x,size.z)); const bb2 = new THREE.Box3().setFromObject(obj); const c = bb2.getCenter(new THREE.Vector3());
          obj.position.set(-c.x, -bb2.min.y, -c.z);
          obj.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; if(/paint|body|carpaint/i.test(o.material?.name||'')) mats.paint = o.material; } });
          scene.remove(car); scene.remove(mirror); car = new THREE.Group(); car.add(obj); mirror = makeMirror(car); scene.add(car); scene.add(mirror);
        }, undefined, e=>{ console.warn('[Showroom] GLB unavailable, keeping studio model', e); gltfKey=null; });
      });
    }
    function apply(s){
      if(s.model3d){ if(!car) mount(s,false); cur = {...s}; loadGLB(s.model3d); return; }
      if(gltfKey){ gltfKey=null; if(car){ scene.remove(car); scene.remove(mirror); car=null; } cur={}; }
      if(!car || s.style!==cur.style || s.brand!==cur.brand || s.wheel!==cur.wheel){
        const structural = car && (s.style!==cur.style || s.brand!==cur.brand);
        if(car && !structural){ // wheel change only: rebuild quickly without fade
          scene.remove(car); scene.remove(mirror); dispose(car); Object.values(mats).forEach(x=>x.dispose()); car=null;
          mount(s, false);
        } else mount(s, !!cur.style);
        cur = {...s}; return;
      }
      if(s.pkg!==cur.pkg){
        mats.trim.setValues(TRIM[s.pkg].trim); mats.rim.setValues(TRIM[s.pkg].rim);
        mats.trim.color.setHex(TRIM[s.pkg].trim.color); mats.rim.color.setHex(TRIM[s.pkg].rim.color);
      }
      if(s.color!==cur.color){
        const from = mats.paint.color.clone(), to = new THREE.Color(s.color);
        const pp = paintProps(s.colorId), m0 = mats.paint.metalness, r0 = mats.paint.roughness, paint = mats.paint;
        tween(700, t=>{ const e=easeIO(t); paint.color.copy(from).lerp(to,e); paint.metalness = m0+(pp.metalness-m0)*e; paint.roughness = r0+(pp.roughness-r0)*e; });
        const contrast = (s.brand==='Range Rover'||s.brand==='Defender') && s.colorId!=='black';
        [car, mirror].forEach(g=>g.traverse(o=>{ if(o.userData.roof) o.material = contrast?mats.roof:mats.paint; }));
      }
      cur = {...s};
    }

    /* ---- Camera choreography ---- */
    const VIEWS = { three:{theta:.95, phi:1.3}, front:{theta:Math.PI/2, phi:1.36}, side:{theta:0, phi:1.42}, rear:{theta:-Math.PI/2, phi:1.3} };
    let baseDist = 9;
    function fitDistance(){
      const a = camera.aspect, vf = camera.fov*Math.PI/180;
      const hf = 2*Math.atan(Math.tan(vf/2)*a);
      const frac = a>1.6 ? .44 : .8;
      return Math.min(22, Math.max(11.2, (5.3/2)/Math.tan(hf/2)/frac));
    }
    const sph = new THREE.Spherical();
    function placeCamera(theta, phi, r){ sph.set(r, phi, theta); camera.position.setFromSpherical(sph).add(controls.target); camera.lookAt(controls.target); }
    function flyTo(v, dist=baseDist, dur=1200){
      const off = camera.position.clone().sub(controls.target); const s0 = new THREE.Spherical().setFromVector3(off);
      let dT = v.theta - s0.theta; dT = Math.atan2(Math.sin(dT), Math.cos(dT));
      const tFrom = controls.target.clone();
      controls.enabled = false;
      tween(dur, t=>{ const e = easeIO(t);
        controls.target.lerpVectors(tFrom, TARGET, e);
        placeCamera(s0.theta + dT*e, s0.phi + (v.phi-s0.phi)*e, s0.radius + (dist-s0.radius)*e);
      }, ()=>{ controls.enabled = true; controls.update(); });
    }

    let spinning = false, idleT = null;
    function pauseAuto(){ controls.autoRotate = false; clearTimeout(idleT); }
    function resumeLater(){ clearTimeout(idleT); idleT = setTimeout(()=>{ if(!spinning){ controls.autoRotateSpeed=.45; controls.autoRotate = true; } }, 8000); }
    controls.addEventListener('start', ()=>{ pauseAuto(); if(spinning){ spinning=false; window.markSpin && markSpin(false); } window.markView && markView(''); });
    controls.addEventListener('end', resumeLater);
    canvas.addEventListener('dblclick', ()=>{ api.view('reset'); window.markView && markView('three'); window.markSpin && markSpin(false); });

    let active = true;
    const api = {
      apply,
      setActive(on){ active = on; if(on){ resize(); } },
      view(v){
        spinning = false; pauseAuto();
        if(v==='reset'){ flyTo(VIEWS.three, baseDist, 1300); resumeLater(); return; }
        flyTo(VIEWS[v]||VIEWS.three, baseDist); resumeLater();
      },
      spin(on){ spinning = on; clearTimeout(idleT); controls.autoRotateSpeed = on ? 3.2 : .45; controls.autoRotate = on; if(!on) resumeLater(); }
    };

    /* ---- Resize & render loop ---- */
    function resize(){
      const w = canvas.clientWidth, h = canvas.clientHeight; if(!w||!h) return;
      renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix();
      const nd = fitDistance();
      const curD = camera.position.distanceTo(controls.target);
      if(Math.abs(curD-baseDist)<.05 || !car) { const off = camera.position.clone().sub(controls.target); if(off.lengthSq()>0) camera.position.copy(controls.target).add(off.setLength(nd)); }
      baseDist = nd;
    }
    new ResizeObserver(resize).observe(canvas);
    let visible = true;
    new IntersectionObserver(es=>{ visible = es[0].isIntersecting; }).observe(stage);

    const clock = new THREE.Clock();
    function loop(){
      requestAnimationFrame(loop);
      const dt = clock.getDelta();
      const now = performance.now();
      for(let i=tweens.length-1;i>=0;i--){ const tw=tweens[i]; const t=Math.min(1,(now-tw.t0)/tw.dur); tw.fn(t); if(t>=1){ tweens.splice(i,1); tw.done&&tw.done(); } }
      if(!active || (!visible && !tweens.length)) return;
      if(controls.enabled) controls.update(dt);
      // keep panning inside the showroom
      controls.target.x = Math.max(-2.2, Math.min(2.2, controls.target.x)); controls.target.z = Math.max(-2.2, Math.min(2.2, controls.target.z)); controls.target.y = Math.max(0.4, Math.min(2.2, controls.target.y));
      renderer.render(scene, camera);
    }

    // initial state
    resize();
    placeCamera(VIEWS.three.theta, VIEWS.three.phi, baseDist);
    controls.update();

    window.Showroom = api;
    window.dispatchEvent(new Event('showroom:ready'));
    loop();
    requestAnimationFrame(()=>{ canvas.classList.add('ready'); document.getElementById('loader').classList.add('hide'); });

  }

})();
