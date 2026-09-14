// Local integration tests: no external requests, workflow calls or data generation.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = process.env.REVIEW_ASSETS || path.join(root, '.review');
const output = path.join(root, '.review', 'screenshots');
let scenario = 'normal';
let failures = [];
const ids = ['temperature','currents','salinity','oxygen','waves','seaLevel'];
const times = ['2026-08-20T00:00:00Z','2026-08-20T01:00:00Z','2026-08-20T02:00:00Z','2026-08-20T03:00:00Z'];
const manifest = {default_condition_id:'temperature', conditions:ids.map(id=>{
  const frames=(id==='oxygen' ? ['2026-08-20T00:00:00Z','2026-08-21T00:00:00Z'] : times).map((time_utc,i)=>({key:`${id}-${i}`,time_utc,min_value:i*10+10,max_value:i*10+10}));
  const condition = {id,label:id==='oxygen'?'Bottom dissolved oxygen':id,depth_mode:id==='oxygen'?'bottom':'surface',units:id==='oxygen'?'mmol/m^3':'m/s',variable:id,query_value_key:'values_primary',dataset_type:'Modelled analysis and forecast',product_id:'BALTICSEA_ANALYSISFORECAST_BGC_003_007',dataset_id:'a-long-dataset-identifier-to-exercise-wrapping-cmems_mod_bal_bgc_anfc_P1D-m',time_resolution_label:id==='oxygen'?'Daily':'Hourly'};
  return {id,condition,available:id!=='seaLevel',metadata:id==='seaLevel'?null:{condition,frames,initial_frame_index:0,query_value_key:'values_primary',query_index_url:`./data/ocean/${id}/query_index.json`,value_range:{min:0,max:40,display_min:-1,display_max:41},provenance:{type:'Modelled analysis and forecast',retrieved_at_utc:'2026-08-20T04:00:00Z'},region:{bbox:{minimum_latitude:53,maximum_latitude:66,minimum_longitude:9,maximum_longitude:31.5},initial_view:{center:[20,59.5],zoom:5},time_zone:'Europe/Copenhagen'}}};
})};
const server=http.createServer(async(req,res)=>{
 try {
  const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(relative==='data/ocean/manifest.json') {
   if(scenario==='missing-manifest') {res.statusCode=404;res.end();return;}
   res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(manifest));return;
  }
  const match=relative.match(/^data\/ocean\/([^/]+)\/(query_index\.json|frames\/([^/]+)\.json)$/);
  if(match) {
   const entry=manifest.conditions.find(c=>c.id===match[1]),m=entry.metadata;
   let payload;
   if(match[2]==='query_index.json') {
    payload={latitudes:[58.5,59.5,60.5],longitudes:[19,20,21],times_utc:m.frames.map(f=>f.time_utc),frames:m.frames.map(f=>({...f,data_url:`./data/ocean/${entry.id}/frames/${f.key}.json`}))};
   } else {
    const index=m.frames.findIndex(f=>f.key===match[3]);
    if(index===1) await new Promise(r=>setTimeout(r,550));
    if(scenario==='missing-frame'&&index===2) {res.statusCode=404;res.end();return;}
    const value=10+index*10;
    payload={...m.frames[index],values_primary:[[value,value,value],[value,value,value],[value,value,value]],components:{eastward_mps:[[1,1,1],[1,1,1],[1,1,1]],northward_mps:[[0,0,0],[0,0,0],[0,0,0]],bottom_depth_m:[[10,20,30],[40,50,60],[70,80,90]]}};
    if(scenario==='wrong-frame'&&index===2) payload.time_utc=times[0];
    if(scenario==='invalid-frame'&&index===2) payload.values_primary[1][1]=-5;
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(payload));return;
  }
  const file=path.join(root,'frontend',relative);
  if(!file.startsWith(path.join(root,'frontend')+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/json'})[path.extname(file)]||'text/plain');
  let content=await fs.readFile(file);
  // Test-only inspection interface, never added to production assets.
  if(relative==='app.js') content=Buffer.concat([content,Buffer.from('\nwindow.review = {state, setSelectedLocation, setActiveOceanCondition, updateOverlayFrame};')]);
  res.end(content);
 }catch(error){res.statusCode=404;res.end();}
});
async function check(name,fn){try{await fn();console.log('PASS',name);}catch(error){failures.push(name);console.error('FAIL',name,error);}}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
async function selectTime(page,n){await page.locator('#time-slider').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},n);}
async function enter(page){await page.locator('#hero-enter-map').click();}
async function openLayers(page){if(await page.locator('#layers-drawer-toggle').isVisible() && await page.locator('#layers-drawer-toggle').getAttribute('aria-expanded')==='false')await page.locator('#layers-drawer-toggle').click();}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 const base=`http://127.0.0.1:${server.address().port}`;
 const newPage=async(mode='normal',viewport={width:1366,height:900})=>{
  const page=await browser.newPage({viewport});
  page.on('pageerror',e=>{failures.push('uncaught browser error');console.error(e);});
  await page.route('https://**/*',async route=>{
   const url=route.request().url();
   if(url.includes('maplibre-gl.js')&&mode!=='cdn-failure') await route.fulfill({path:path.join(assets,'maplibre-gl.js'),contentType:'text/javascript'});
   else if(url.includes('maplibre-gl.css')) await route.fulfill({path:path.join(assets,'maplibre-gl.css'),contentType:'text/css'});
   else await route.abort();
  });
  if(mode==='no-webgl') await page.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};
  });
  await page.goto(base);
  await page.waitForFunction(()=>window.review && (review.state.mapReady || review.state.mapFailed));
  return page;
 };
 try {
  await check('CDN failure: visible homepage fallback, no hidden map controls in tab order',async()=>{
   const page=await newPage('cdn-failure');
   assert.ok(await page.locator('#map-fallback').isVisible());
   assert.equal(await page.locator('#map-sidebar-shell').evaluate(e=>e.inert),true);
   await page.locator('#language-button').click();
   assert.ok(await page.locator('#language-menu').isVisible());
   assert.ok(await page.locator('#language-menu button:disabled').count()>0);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#language-menu').isVisible(),false);
   await page.screenshot({path:path.join(output,'home-desktop.png')});
   await page.close();
  });
  await check('responsive, keyboard and drawer controls at all required widths + landscape',async()=>{
   for(const [width,height] of [[320,780],[375,812],[430,932],[768,1024],[1366,900],[768,375],[667,320]]) {
    const page=await newPage('no-webgl',{width,height});
    await noOverflow(page);
    if(width===375)await page.screenshot({path:path.join(output,'home-mobile.png'),fullPage:true});
    await enter(page);
    await noOverflow(page);
    assert.ok(await page.locator('#map-fallback').isVisible());
    assert.ok(await page.locator('#exit-map').isVisible());
    assert.ok(await page.locator('#view-toggle').isDisabled());
    assert.ok(await page.locator('#noise-toggle').isDisabled());
    assert.ok((await page.locator('#map-bottom-left').boundingBox()).width>200);
    const before=await page.locator('#time-primary').textContent();
    await page.locator('#time-slider').focus();await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.locator('#time-primary').textContent(),before);
    assert.match(await page.locator('#time-slider').getAttribute('aria-valuetext'),/UTC/);
    assert.match(await page.locator('#time-slider').evaluate(e=>getComputedStyle(e).outlineStyle),/solid/);
    await openLayers(page);
    if(width<=980)assert.equal(await page.locator('#map-bottom-left').isVisible(),false);
    assert.equal(await page.locator('#map-left-sidebar').evaluate(e=>e.scrollWidth>e.clientWidth),false);
    await page.locator('[data-overlay-info-button="oxygen"]').click();
    assert.ok(await page.locator('#overlay-info-panel').isVisible());
    assert.match(await page.locator('#overlay-info-body').textContent(),/deepest/i);
    if(width<=980)assert.equal(await page.locator('#map-left-sidebar').isVisible(),false);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.overlayInfoButton),'oxygen');
    await page.locator('#sea-level-toggle').click();
    assert.ok(await page.locator('#time-slider').isDisabled());
    await page.locator('#temperature-toggle').click();
    if(width<=980)await page.locator('#layers-drawer-toggle').click();
    await page.screenshot({path:path.join(output,`map-${width}x${height}.png`)});
    await page.locator('#exit-map').click();
    assert.equal(await page.locator('body').getAttribute('data-mode'),'home');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'hero-enter-map');
    await page.close();
   }
  });
  await check('missing manifest keeps overview, layer guides and map navigation usable',async()=>{
   scenario='missing-manifest';const page=await newPage('no-webgl');await enter(page);
   await page.locator('[data-overlay-info-button="oxygen"]').click();
   assert.ok(await page.locator('#overlay-info-panel').isVisible());
   assert.ok(await page.locator('#time-slider').isDisabled());
   await page.close();scenario='normal';
  });
  const page=await newPage();
  if(!await page.evaluate(()=>review.state.mapReady)) {
   console.log('LIMITATION: real WebGL could not initialize in this browser; renderer synchronization tests were not run.');
  } else {
   await enter(page);
   await check('real WebGL: overlay, timestamp, palette, sample and location synchronize',async()=>{
    await page.waitForFunction(()=>review.state.frameStatus==='ready');
    await page.evaluate(()=>review.setSelectedLocation(59.5,20));
    assert.match(await page.locator('#clicked-primary-value').textContent(),/10.00/);
    await selectTime(page,3); await page.waitForFunction(()=>review.state.frameStatus==='ready'&&review.state.selectedLocation?.sampleText?.startsWith('40.00'));
    assert.equal(await page.locator('#map').getAttribute('data-frame'),times[3]);
    assert.match(await page.locator('#clicked-time').textContent(),/03:00 UTC/);
    assert.match(await page.locator('#ocean-condition-legend-range').textContent(),/40.00/);
    const source=await page.evaluate(()=>review.state.map.getSource('ocean-scalar-source')._data);
    assert.ok(source.features.length>0);
    await page.waitForFunction(expected=>{
      const map=review.state.map;
      const rendered=map.queryRenderedFeatures(map.project([20,59.5]),{layers:['ocean-scalar-fill']});
      return rendered.length>0 && rendered.every(feature=>feature.properties.fillColor===expected);
    },source.features[0].properties.fillColor);
    assert.match(await page.locator('#clicked-coordinates').textContent(),/59.5000 N/);
    await page.screenshot({path:path.join(output,'webgl-synchronized.png')});
   });
   await check('rapid slider input: delayed old response cannot overwrite newer selection',async()=>{
    await selectTime(page,1);await selectTime(page,2);
    await page.waitForFunction(()=>review.state.frameStatus==='ready'&&review.state.selectedLocation?.sampleText?.startsWith('30.00'));
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#map').getAttribute('data-frame'),times[2]);
    assert.match(await page.locator('#clicked-primary-value').textContent(),/30.00/);
    await page.locator('[data-overlay-info-button="temperature"]').click();
    await selectTime(page,3);
    assert.match(await page.locator('#overlay-info-body').textContent(),/20 Aug 2026, 03:00 UTC/);
    await page.locator('#overlay-info-close').click();
   });
   await check('rapid layer changes, layer-off invalidation, nearest actual time, bottom sample depth',async()=>{
    await page.evaluate(()=>{review.state.requestedTimeUtc='2026-08-20T23:00:00Z';review.setActiveOceanCondition('oxygen');});
    await page.waitForFunction(()=>review.state.frameStatus==='ready'&&review.state.selectedLocation?.sampleText?.includes('model depth'));
    assert.match(await page.locator('#time-primary').textContent(),/21 Aug 2026, 00:00 UTC/);
    assert.match(await page.locator('#time-secondary').textContent(),/Nearest available/);
    assert.match(await page.locator('#clicked-primary-value').textContent(),/50.0 m model depth/);
    assert.match(await page.locator('#ocean-condition-legend-title').textContent(),/Oxygen/);
    await page.evaluate(()=>{review.setActiveOceanCondition('currents');review.setActiveOceanCondition('salinity');review.setActiveOceanCondition('salinity');});
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#map').getAttribute('data-frame'),null);
    assert.equal(await page.locator('#click-panel').isVisible(),false);
    assert.ok(await page.evaluate(()=>review.state.selectedLocation!==null));
   });
   for(const mode of ['missing-frame','wrong-frame','invalid-frame'])await check(mode+' is explicit and never leaves the previous overlay or sample',async()=>{
    scenario=mode;
    const p=await newPage();await enter(p);await p.evaluate(()=>review.setActiveOceanCondition('salinity'));
    await p.waitForFunction(()=>review.state.frameStatus==='ready');
    await p.evaluate(()=>review.setSelectedLocation(59.5,20));
    await selectTime(p,2);
    await p.waitForFunction(()=>['ready','error'].includes(review.state.frameStatus));
    if(mode==='invalid-frame') {
     assert.match(await p.locator('#frame-load-status').textContent(),/invalid values excluded/);
     await p.waitForFunction(()=>review.state.selectedLocation.sampleText?.includes('No valid'));
    }else{
     assert.match(await p.locator('#frame-load-status').textContent(),/could not be loaded/);
     assert.equal(await p.locator('#map').getAttribute('data-frame'),null);
    }
    await p.close();scenario='normal';
   });
   await check('infrastructure, noise and colour controls respond; hidden cards leave tab order',async()=>{
    await page.locator('#infrastructure-toggle').click();
    await page.waitForFunction(()=>review.state.infrastructure.loaded);
    assert.ok(await page.locator('#infrastructure-panel').isVisible());
    await page.locator('#infrastructure-category-list button').first().click();
    await page.locator('#noise-toggle').click();
    assert.ok(await page.locator('#noise-panel').isVisible());
    await page.locator('[data-overlay-info-button="noise"]').click();
    assert.ok((await page.locator('#overlay-info-body a').count())>0);
   });
  }
  await page.close();
 }finally{await browser.close();server.close();}
 if(failures.length){console.error(failures);process.exitCode=1;}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
