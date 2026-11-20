/* Prodboard AI nástroj PALUAN — zostavené 2026-11-20 05:32. Načítava ho zavádzač zo skriptu inštancie. */
(function () {
if (typeof Prodboard === 'undefined' || !Prodboard.Constructor || window.pb) return
window.__pbEmployeesOnly = true
(function () {
const C = Prodboard.Constructor
const injector = () => {
const inj = angular.element(document.body).injector() ||
angular.element(document.querySelector('.ng-scope')).injector()
if (!inj) throw new Error('Konštruktor Prodboard nie je načítaný (chýba Angular injektor)')
return inj
}
const service = name => injector().get(name)
const ctx = () => service('$context')
const model = () => ctx().project.model
const planner = () => model().planner
const WALLS = ['back', 'left', 'right', 'front']
const DEFAULT_ELEVATION = { base: 0, tall: 0, wall: 1400 }
const DEFAULT_ASSET_ELEVATION = { kitchenHood: 1550, window: 900 }
const kindOf = mod => {
const t = String(mod.type || '')
if (t.startsWith('wall')) return 'wall'
if (t.startsWith('tall')) return 'tall'
return 'base'
}
const findModule = code => {
const mod = C.CatalogResources.modules.all().firstOrDefault(m => m.code === code)
if (!mod) throw new Error(`Modul "${code}" nie je v katalógu (pb.modules() vypíše dostupné)`)
return mod
}
const findAsset = code => {
const a = C.LibraryResources.assets.all().find(x => x.code === code)
if (!a) throw new Error(`Prvok "${code}" nie je v knižnici (pb.assets() vypíše dostupné)`)
return a
}
const findStructure = kind => {
const tpl = C.GenericElement.Templates().find(t => t.id === kind)
if (!tpl) throw new Error(`Neznámy stavebný prvok "${kind}" (${C.GenericElement.Templates().map(t => t.id).join(', ')})`)
return tpl
}
const byUuid = uuid => {
const e = planner().elements().firstOrDefault(x => x.uuid === uuid)
if (!e) throw new Error(`Prvok ${uuid} v pláne neexistuje`)
return e
}
const codeOf = el => el.prototype && el.prototype.section ? el.prototype.section.code
: el.asset ? el.asset.code : el.template ? el.template.id : null
const elKind = el => el.asset ? 'appliance' : el.template ? 'structure' : 'cabinet'
const sizeOf = el => el instanceof C.GenericElement
? { x: el.width.value, y: el.height.value, z: el.depth.value }
: { x: el.size.x, y: el.size.y, z: el.size.z }
const num = (name, v, { min = -Infinity, positive = false } = {}) => {
if (v == null) return v
if (typeof v !== 'number' || !isFinite(v)) throw new Error(`${name} musí byť číslo (mm), je ${JSON.stringify(v)}`)
if (positive && v <= 0) throw new Error(`${name} musí byť kladné, je ${v}`)
if (v < min) throw new Error(`${name} nesmie byť menšie ako ${min}, je ${v}`)
return v
}
const attrEntries = uuid => {
const el = byUuid(uuid)
if (!el.element.options) throw new Error(`Prvok ${uuid} nemá voľby (nie je to skrinka)`)
const out = []
for (const it of el.element.options.options.items) {
const v = it.value
if (!v || !v.classification) continue
for (const ins of v.classification.instances || [])
for (const ai of ins.attributes || []) out.push({ it, ai })
}
return out
}
const findAttr = (uuid, option, attr) => {
const list = attrEntries(uuid).filter(x =>
x.it.option.code === option || (x.it.option.name && x.it.option.name.inv === option))
if (!list.length) throw new Error(`Skrinka nemá voľbu "${option}" s atribútmi (pb.attributes(uuid))`)
const byName = list.filter(x => x.ai.attribute.name && x.ai.attribute.name.inv === attr)
if (byName.length) return byName[0]
const byCode = list.filter(x => x.ai.attribute.code === attr)
if (byCode.length === 1) return byCode[0]
if (byCode.length > 1) throw new Error(`Atribút "${attr}" je vo voľbe ${option} viackrát, zadaj názov: ` +
byCode.map(x => x.ai.attribute.name && x.ai.attribute.name.inv).join(' / '))
throw new Error(`Voľba ${option} nemá atribút "${attr}". Má: ` +
list.map(x => x.ai.attribute.code + ' (' + (x.ai.attribute.name && x.ai.attribute.name.inv) + ')').join(', '))
}
const attrCandidates = (it, ai) => {
const type = Prodboard.AttributeDataType[ai.attribute.dataType]
if (type === 'enum') return (ai.attribute.options || []).map(o => ({ code: o.code, name: o.name && o.name.inv, value: o }))
if (['material', 'decor', 'model', 'profile', 'doorFamily', 'module'].includes(type)) {
let cols = []
try { cols = it.dictionary.collectionsFor(ai) } catch (e) {  }
return cols.flatMap(c => c.items || []).filter(i => i.item)
.map(i => ({ code: i.item.code, name: i.item.name && i.item.name.inv, value: i.item }))
}
return null
}
const resolveAttrValue = (it, ai, value, label) => {
const type = Prodboard.AttributeDataType[ai.attribute.dataType]
const cands = attrCandidates(it, ai)
if (cands) {
const s = String(value).toLowerCase()
const hit = cands.find(c => c.code === value) || cands.find(c => (c.name || '').toLowerCase() === s)
if (hit) return hit.value
if (type === 'model') {
const a = C.LibraryResources.assets.all().find(x => x.code === value)
const sameType = cands.length && cands[0].value && a && a.type === cands[0].value.type
if (a && (sameType || !cands.length)) return a
if (a) throw new Error(`"${value}" je ${Prodboard.AssetType[a.type]}, ${label} očakáva ${Prodboard.AssetType[cands[0].value.type]}`)
}
throw new Error(`"${value}" nie je medzi hodnotami ${label}. Napr.: ` +
cands.slice(0, 8).map(c => c.code + ' (' + c.name + ')').join(', ') + ' … (pb.attributeValues)')
}
if (type === 'length' || type === 'number') return num(label, Number(value))
if (type === 'bool') return value === true || value === 'true' || value === 1
return value
}
const projectInstance = (option, collection) => {
const groups = model().resources.options.options.groups.filter(g => g.option &&
(g.option.code === option || (g.option.name && g.option.name.inv === option)))
const g = groups.find(x => collection == null ? !x.collection
: x.collection && (x.collection.code === collection || (x.collection.name && x.collection.name.inv) === collection))
if (!g || !g.instances || !g.instances.length) throw new Error(`Projektová voľba ${option} pre kolekciu ${collection} neexistuje. ` +
`Kolekcie: ${groups.map(x => x.collection ? (x.collection.code || (x.collection.name && x.collection.name.inv)) : 'null').join(', ')}`)
return g.instances[0]
}
const roomSize = () => model().environment.dimensions.value
const wallLength = wall => {
const r = roomSize()
return wall === 'back' || wall === 'front' ? r.x : r.z
}
const CORNERS = {
'back-left': { primary: 'back', secondary: 'left', pStart: true, sStart: true },
'back-right': { primary: 'right', secondary: 'back', pStart: true, sStart: false },
'front-right': { primary: 'front', secondary: 'right', pStart: false, sStart: false },
'front-left': { primary: 'left', secondary: 'front', pStart: false, sStart: true },
}
const isViewerLeft = (wall, atStart) => (wall === 'back' || wall === 'right') ? atStart : !atStart
const placement = (wall, at, w, h, d, bottom) => {
const room = roomSize()
const y = bottom + h / 2
switch (wall) {
case 'back': return { pos: [at + w / 2, y, d / 2], normal: [0, 0, 1] }
case 'front': return { pos: [at + w / 2, y, room.z - d / 2], normal: [0, 0, -1] }
case 'left': return { pos: [d / 2, y, at + w / 2], normal: [1, 0, 0] }
case 'right': return { pos: [room.x - d / 2, y, at + w / 2], normal: [-1, 0, 0] }
default: throw new Error(`Neznáma stena "${wall}" (back/left/right/front)`)
}
}
const isFree = opts => opts.x != null || opts.z != null || opts.wall === 'free'
const posFor = (opts, w, h, d, bottom) => {
if (isFree(opts)) {
if (opts.x == null || opts.z == null) throw new Error('Voľné umiestnenie potrebuje x aj z (stred prvku v mm)')
const a = (opts.rotation || 0) * Math.PI / 180
return { pos: [opts.x, bottom + h / 2, opts.z], normal: [Math.round(Math.sin(a) * 1e6) / 1e6, 0, Math.round(Math.cos(a) * 1e6) / 1e6] }
}
return placement(opts.wall || 'back', opts.at || 0, w, h, d, bottom)
}
const locate = e => {
const n = e.center.normal, p = e.center.pos, s = sizeOf(e.element), r = roomSize()
const tol = 10
let wall = null
if (n.z > 0.99 && Math.abs(p.z - s.z / 2) <= tol) wall = 'back'
else if (n.z < -0.99 && Math.abs(r.z - p.z - s.z / 2) <= tol) wall = 'front'
else if (n.x > 0.99 && Math.abs(p.x - s.z / 2) <= tol) wall = 'left'
else if (n.x < -0.99 && Math.abs(r.x - p.x - s.z / 2) <= tol) wall = 'right'
const bottom = Math.round(p.y - s.y / 2)
if (wall) {
const along = wall === 'back' || wall === 'front' ? p.x : p.z
return { wall, at: Math.round(along - s.x / 2), bottom }
}
const rot = ((Math.round(Math.atan2(n.x, n.z) * 180 / Math.PI) % 360) + 360) % 360
return { wall: 'free', x: Math.round(p.x), z: Math.round(p.z), rotation: rot, bottom }
}
const insertElement = (element, opts, bottom) => {
const pl = planner()
pl.startBatch()
let el = null
try {
el = pl.attach(element)
el.attached = true
const s = sizeOf(element)
const p = posFor(opts, s.x, s.y, s.z, bottom)
el.moveTo(new Prodboard.Vertex(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.normal)))
} catch (e) {
if (el) { try { pl.detach(el) } catch (_) {  } }
throw e
} finally {
pl.endBatch()
}
return el
}
const resultOf = (el, extra) => {
const s = sizeOf(el.element)
const loc = locate(el)
const r = Object.assign({ uuid: el.uuid, code: codeOf(el.element), kind: elKind(el.element) }, loc,
{ width: s.x, height: s.y, depth: s.z }, extra)
if (loc.wall !== 'free') r.end = loc.at + s.x
return r
}
const recalcInjections = () => {
const pl = planner()
pl._processInjections = false
pl.startBatch()
try { pl.recalculateInjections('pb') } finally { pl._processInjections = false; pl.endBatch() }
}
const injectedList = () => planner().elements().filter(e => e.element.injectionBox).map(e => ({
uuid: e.uuid, code: e.element.prototype.section.code,
width: Math.round(e.element.size.x),
center: { x: Math.round(e.center.pos.x), y: Math.round(e.center.pos.y), z: Math.round(e.center.pos.z) },
}))
const plainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const SPEC_KEYS = ['room', 'decor', 'corners', 'runs', 'items', 'appliances', 'structures', 'project', 'style',
'materials', 'dimensions', 'labels', 'lighting', 'clear']
const RUN_KEYS = ['wall', 'level', 'anchor', 'start', 'end', 'items']
const ITEM_KEYS = ['code', 'wall', 'at', 'x', 'z', 'rotation', 'width', 'height', 'depth', 'elevation', 'gap',
'options', 'attributes', 'collection']
const CORNER_KEYS = ['corner', 'code', 'wall', 'width', 'height', 'depth', 'elevation', 'options', 'attributes', 'collection']
const checkSpec = spec => {
const errors = [], warnings = []
const err = m => errors.push({ error: 'spec', message: m })
const unknown = (obj, allowed, where) => {
for (const k of Object.keys(obj)) if (!k.startsWith('_') && !allowed.includes(k))
warnings.push(`Neznámy kľúč "${k}" v ${where} — ignoruje sa (preklep?)`)
}
const tryNum = (name, v, o) => { try { num(name, v, o) } catch (e) { err(e.message) } }
const tryModule = (code, where) => {
if (typeof code !== 'string') { err(`${where}: chýba "code"`); return null }
try { return findModule(code) } catch (e) { err(`${where}: ${e.message}`); return null }
}
const checkPlacement = (o, where) => {
if (isFree(o)) {
if (o.x == null || o.z == null) err(`${where}: voľné umiestnenie potrebuje x aj z`)
tryNum(`${where}.x`, o.x); tryNum(`${where}.z`, o.z); tryNum(`${where}.rotation`, o.rotation)
} else {
if (o.wall != null && !WALLS.includes(o.wall)) err(`${where}: neznáma stena "${o.wall}" (${WALLS.join('/')})`)
tryNum(`${where}.at`, o.at, { min: 0 })
}
tryNum(`${where}.elevation`, o.elevation, { min: 0 })
for (const k of ['width', 'height', 'depth']) tryNum(`${where}.${k}`, o[k], { positive: true })
}
const checkItem = (i, where) => {
if (typeof i === 'string') { tryModule(i, where); return }
if (!plainObject(i)) { err(`${where}: položka musí byť kód alebo objekt`); return }
unknown(i, ITEM_KEYS, where)
tryModule(i.code, where)
tryNum(`${where}.gap`, i.gap, { min: 0 })
for (const k of ['width', 'height', 'depth', 'elevation']) tryNum(`${where}.${k}`, i[k], { positive: k !== 'elevation', min: 0 })
if (i.options != null && !plainObject(i.options)) err(`${where}.options musí byť objekt { voľba: hodnota }`)
if (i.attributes != null && !(Array.isArray(i.attributes) && i.attributes.every(a => Array.isArray(a) && a.length === 3)))
err(`${where}.attributes musí byť pole trojíc [voľba, atribút, hodnota]`)
}
if (!plainObject(spec)) { err('Špecifikácia musí byť JSON objekt'); return { errors, warnings } }
unknown(spec, SPEC_KEYS, 'špecifikácii')
if (!plainObject(spec.room)) err('Chýba "room" s rozmermi miestnosti')
else {
const r = spec.room
if ((r.width ?? r.x) == null || (r.depth ?? r.z) == null) err('room potrebuje width (zadná stena) a depth (bočné steny)')
tryNum('room.width', r.width ?? r.x, { positive: true })
tryNum('room.depth', r.depth ?? r.z, { positive: true })
tryNum('room.height', r.height ?? r.y, { positive: true })
}
const arr = (k, fn) => {
if (spec[k] == null) return
if (!Array.isArray(spec[k])) { err(`"${k}" musí byť pole`); return }
spec[k].forEach((x, i) => fn(x, `${k}[${i}]`))
}
arr('corners', (c, w) => {
if (!plainObject(c)) { err(`${w}: musí byť objekt`); return }
unknown(c, CORNER_KEYS, w)
if (!CORNERS[c.corner]) err(`${w}: neznámy roh "${c.corner}" (${Object.keys(CORNERS).join(', ')})`)
tryModule(c.code, w)
if (c.wall != null && !WALLS.includes(c.wall)) err(`${w}: neznáma stena "${c.wall}"`)
})
arr('runs', (r, w) => {
if (!plainObject(r)) { err(`${w}: musí byť objekt`); return }
unknown(r, RUN_KEYS, w)
if (!WALLS.includes(r.wall)) err(`${w}: neznáma stena "${r.wall}" (${WALLS.join('/')})`)
if (r.level != null && !['base', 'wall'].includes(r.level)) err(`${w}: level musí byť "base" alebo "wall" (vysoké skrinky patria do "base")`)
if (r.anchor != null && !['start', 'end'].includes(r.anchor)) err(`${w}: anchor musí byť "start" alebo "end"`)
tryNum(`${w}.start`, r.start, { min: 0 }); tryNum(`${w}.end`, r.end, { min: 0 })
if (!Array.isArray(r.items) || !r.items.length) err(`${w}: chýba neprázdne pole "items"`)
else r.items.forEach((i, j) => checkItem(i, `${w}.items[${j}]`))
})
arr('items', (i, w) => { checkItem(i, w); if (plainObject(i)) checkPlacement(i, w) })
arr('appliances', (a, w) => {
if (!plainObject(a)) { err(`${w}: musí byť objekt`); return }
try { findAsset(a.code) } catch (e) { err(`${w}: ${e.message}`) }
checkPlacement(a, w)
})
arr('structures', (s, w) => {
if (!plainObject(s)) { err(`${w}: musí byť objekt`); return }
try { findStructure(s.kind) } catch (e) { err(`${w}: ${e.message}`) }
checkPlacement(s, w)
})
const triples = k => arr(k, (t, w) => { if (!Array.isArray(t) || t.length !== 3) err(`${w}: musí byť trojica [${k === 'project' ? 'voľba, kolekcia, hodnota' : 'voľba, atribút, hodnota'}]`) })
triples('project'); triples('materials')
if (spec.style != null && !plainObject(spec.style)) err('"style" musí byť objekt { voľba: hodnota }')
if (spec.lighting != null && !plainObject(spec.lighting)) err('"lighting" musí byť objekt')
if (spec.decor != null && !plainObject(spec.decor)) err('"decor" musí byť objekt { wall, floor }')
arr('dimensions', (d, w) => {
const p3 = v => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number')
if (!plainObject(d) || !p3(d.start) || !p3(d.end)) err(`${w}: potrebuje start a end ako [x, y, z]`)
})
arr('labels', (l, w) => {
if (!plainObject(l) || typeof l.text !== 'string' || !(Array.isArray(l.point) && l.point.length === 3)) err(`${w}: potrebuje text a point [x, y, z]`)
})
return { errors, warnings }
}
const pb = {
modules(filter) {
const f = filter ? String(filter).toLowerCase() : null
return C.CatalogResources.modules.all()
.filter(m => !f || m.code.toLowerCase().includes(f) ||
((m.name && m.name.inv) || '').toLowerCase().includes(f))
.map(m => ({ code: m.code, name: m.name && m.name.inv, type: m.type }))
},
catalog() {
const m = model()
const range = r => r ? { min: r.min, default: r.default, max: r.max, items: r.items } : null
return C.CatalogResources.modules.all().map(x => {
let t = null
try { t = m.catalog.resolve(x) } catch (e) {  }
const s = t && t.section
return {
code: x.code, name: x.name && x.name.inv, type: x.type, kind: kindOf(x),
collections: ((s && s.classification && s.classification.collections) || []).map(c => c.code),
width: t && range(t.width), height: t && range(t.height), depth: t && range(t.depth),
}
})
},
module(code) {
const mod = findModule(code)
const t = model().catalog.resolve(mod)
const range = r => ({ min: r.min, default: r.default, max: r.max, items: r.items })
return { code: mod.code, name: mod.name && mod.name.inv, kind: kindOf(mod),
width: range(t.width), height: range(t.height), depth: range(t.depth) }
},
assets(filter, type) {
const f = filter ? String(filter).toLowerCase() : null
return C.LibraryResources.assets.all()
.filter(a => !type || Prodboard.AssetType[a.type] === type)
.filter(a => !f || a.code.toLowerCase().includes(f) ||
((a.name && a.name.inv) || '').toLowerCase().includes(f))
.map(a => ({
code: a.code, name: a.name && a.name.inv, type: Prodboard.AssetType[a.type],
size: a.size ? { x: a.size.x, y: a.size.y, z: a.size.z } : null,
collections: ((a.classification && a.classification.collections) || []).map(c => c.name && c.name.inv),
}))
},
decors(type, filter) {
const f = filter ? String(filter).toLowerCase() : null
return C.LibraryResources.materials.all()
.filter(x => (x.tags || []).includes(type))
.filter(x => !f || x.code.toLowerCase().includes(f) || ((x.name && x.name.inv) || '').toLowerCase().includes(f))
.map(x => ({ code: x.code, name: x.name && x.name.inv }))
},
aiCatalog(base) {
const k = JSON.parse(JSON.stringify(base)), report = []
const build = k._build || {}
delete k._build
const part = (label, fn) => {
try { const r = fn(); if (r) report.push(`${label}: ${r}`) }
catch (e) { report.push(`${label}: ponechané zo zostavenia (${e && e.message || e})`) }
}
const name = x => x && x.name && x.name.inv
part('moduly', () => {
const all = C.CatalogResources.modules.all()
if (!all || !all.length) throw new Error('katalóg modulov je prázdny')
const m = model(), byCode = new Map(all.map(x => [x.code, x]))
const rng = r => r && r.min != null && r.max != null && r.min !== r.max ? [r.min, r.max] : null
const row = (x, prev) => {
const t = m.catalog.resolve(x)
const cols = ((t.section && t.section.classification && t.section.classification.collections) || []).map(c => c.code)
const shape = prev ? prev[4] : /-LM(-|$)/.test(x.code) ? 'corner' : /(SR|H)-PR(-|$)/.test(x.code) ? 'cornerLine'
: /UKON/.test(x.code) ? 'end' : null
return [x.code, prev ? prev[1] : name(x), kindOf(x), prev ? prev[3] : cols.some(c => /gripless/.test(c)) ? 'gripless' : 'standard',
shape, t.width.default, rng(t.width), t.height.default, rng(t.height), t.depth.default]
}
let removed = 0, added = 0
const out = []
for (const prev of k.modules) {
const x = byCode.get(prev[0])
if (!x) { removed++; continue }
try { out.push(row(x, prev)) } catch (e) { out.push(prev) }
}
const known = new Set(k.modules.map(r => r[0]).concat(build.excluded_modules || []))
for (const x of all) {
if (known.has(x.code) || !/script$/.test(String(x.type || ''))) continue
let t
try { t = m.catalog.resolve(x) } catch (e) { continue }
const cols = ((t && t.section && t.section.classification && t.section.classification.collections) || []).map(c => c.code)
if (!cols.some(c => /kitchen_cabinet/.test(c))) continue
try { out.push(row(x)); added++ } catch (e) {  }
}
k.modules = out
return `${out.length} (nové ${added}, zrušené ${removed})`
})
part('spotrebiče', () => {
const all = C.LibraryResources.assets.all()
if (!all || !all.length) throw new Error('knižnica je prázdna')
const byCode = new Map(all.map(a => [a.code, a]))
let n = 0, removed = 0
for (const key of Object.keys(k.appliances)) {
k.appliances[key] = k.appliances[key].filter(r => {
const a = byCode.get(r[0])
if (!a) { removed++; return false }
if (r.length > 3 && a.size) r[3] = [Math.round(a.size.x), Math.round(a.size.y), Math.round(a.size.z)]
n++
return true
})
}
return `${n} (zrušené ${removed})`
})
const groups = () => ((model().resources.options.options.groups) || []).filter(g => g.option && g.instances &&
g.instances.length && (!g.collection || /kitchen_cabinet/.test(g.collection.code || '')))
const special = /na vysokej skrini|profil stredný|rohová|priama|chladničkový/   // varianty len pre niektoré skrinky
part('voľby štýlu', () => {
const cabs = planner().elements().filter(x => x.attached && !x.element.injectionBox && x.element.options)
const gs = groups()
if (!cabs.length && !gs.length) throw new Error('projekt nemá voľby')
const fresh = []
let exact = 0, checked = 0, removed = 0
for (const key of Object.keys(k.style)) {
const is = o => o.code === key || name(o) === key
const fromCabs = [], fromGroups = []
for (const e of cabs) for (const it of e.element.options.options.items) if (is(it.option))
for (const v of it.values || []) { const s = name(v); if (s && !special.test(s) && !fromCabs.includes(s)) fromCabs.push(s) }
for (const g of gs.filter(g => is(g.option)))
for (const v of g.instances[0].values || []) { const s = name(v); if (s && !fromGroups.includes(s)) fromGroups.push(s) }
if (fromCabs.length) {
const order = v => { const i = k.style[key].indexOf(v); return i < 0 ? 1e6 : i }
k.style[key] = fromCabs.sort((a, b) => order(a) - order(b)); exact++
} else if (fromGroups.length) {
const kept = k.style[key].filter(v => fromGroups.includes(v))
removed += k.style[key].length - kept.length
if (kept.length) k.style[key] = kept
checked++
for (const v of fromGroups) if (!k.style[key].includes(v) && !special.test(v)) fresh.push(`${key}: ${v}`)
}
}
return `zo skriniek v projekte ${exact}, overené ${checked} (zrušené ${removed})` +
(fresh.length ? `; v plánovači sú aj ďalšie hodnoty (nezaradené, doplň do ai-katalog.json, ak ich má AI používať): ${fresh.join(' | ')}` : '')
})
part('hodnoty (farby, dekory)', () => {
const gs = groups()
if (!gs.length) throw new Error('projekt nemá voľby')
const done = []
for (const key of Object.keys(k.values)) {
const mm = /^(\S+) \/ (\S+)/.exec(key)
if (!mm) continue
const [, opt, attr] = mm, seen = new Map()
for (const g of gs.filter(g => g.option.code === opt)) {
const inst = g.instances[0]
for (const v of inst.values || [])
for (const ci of (v.classification && v.classification.instances) || [])
for (const ai of ci.attributes || []) {
if (ai.attribute.code !== attr) continue
for (const c of attrCandidates(inst, ai) || [])
if (c.code && !seen.has(c.code) && !/VYRADEN/i.test(c.name || '')) seen.set(c.code, c.name)
}
}
if (seen.size) { k.values[key] = [...seen].map(([c, nm]) => `${c} = ${nm}`); done.push(`${attr} ${seen.size}`) }
}
return done.join(', ') || 'nenašli sa, ponechané zo zostavenia'
})
const d = new Date(), p = x => String(x).padStart(2, '0')
k._info = `Katalóg PALUAN prečítaný priamo z plánovača ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
`${p(d.getHours())}:${p(d.getMinutes())}. Rozmery v mm.`
return { katalog: k, report }
},
room(x, y, z) {
const env = model().environment
const r = env.dimensions.value
if (x == null && y == null && z == null) return { x: r.x, y: r.y, z: r.z }
num('room x', x, { positive: true }); num('room y', y, { positive: true }); num('room z', z, { positive: true })
env.dimensions.value = new THREE.Vector3(x != null ? x : r.x, y != null ? y : r.y, z != null ? z : r.z)
return pb.room()
},
wallLength(wall) {
if (!WALLS.includes(wall)) throw new Error(`Neznáma stena "${wall}"`)
return wallLength(wall)
},
decor({ wall, floor } = {}) {
const env = model().environment
const find = (code, type) => {
const d = C.LibraryResources.materials.all().find(x => x.code === code && (x.tags || []).includes(type))
if (!d) throw new Error(`Dekor "${code}" (${type}) nie je v knižnici (pb.decors('${type}'))`)
return d
}
if (wall) env.wall = find(wall, 'wall')
if (floor) env.floor = find(floor, 'floor')
return { wall: env.wall && env.wall.code, floor: env.floor && env.floor.code }
},
add(code, opts = {}) {
const m = model(), pl = planner()
const mod = findModule(code)
const type = m.catalog.resolve(mod)
const kind = kindOf(mod)
for (const k of ['width', 'height', 'depth']) num(k, opts[k], { positive: true })
num('at', opts.at, { min: 0 }); num('elevation', opts.elevation, { min: 0 })
const w = opts.width != null ? opts.width : type.width.default
const h = opts.height != null ? opts.height : type.height.default
const d = opts.depth != null ? opts.depth : type.depth.default
const bottom = opts.elevation != null ? opts.elevation : DEFAULT_ELEVATION[kind]
if (type.width.min != null && (w < type.width.min || w > type.width.max))
console.warn(`pb.add: šírka ${w} mimo rozsahu ${type.width.min}–${type.width.max} pre ${code}`)
const collections = type.section.classification.collections || []
const collection = opts.collection != null
? collections.find(c => c.id === opts.collection || c.code === opts.collection)
: collections[0]
if (!collection) throw new Error(`Modul ${code} nemá kolekciu — bez nej ho planner nevie spracovať`)
const section = C.Section.create(m, type, new THREE.Vector3(w, h, d), null, null, collection)
const el = insertElement(section, opts, bottom)
try {
if (opts.options) pb.option(el.uuid, opts.options, { skipInjections: true })
for (const [o, a, v] of opts.attributes || []) pb.attribute(el.uuid, o, a, v, { skipInjections: true })
} catch (e) {
pl.startBatch(); try { pl.detach(el) } finally { pl.endBatch() }
throw new Error(`${code}: ${e.message}`)
}
if (opts.injections !== false) recalcInjections()
return resultOf(el, { kind })
},
corner(corner, code, opts = {}) {
const def = CORNERS[corner]
if (!def) throw new Error(`Neznámy roh "${corner}" (${Object.keys(CORNERS).join(', ')})`)
const m = model()
const type = m.catalog.resolve(findModule(code))
const shape = Prodboard.CabinetShape[type.shape != null ? type.shape : type.section.shape]
const isL = shape === 'corner' || /-LM(-|$)/.test(code)
const w = opts.width || type.width.default
let wall, atStart
if (isL || !opts.wall || opts.wall === def.primary) { wall = def.primary; atStart = def.pStart }
else if (opts.wall === def.secondary) { wall = def.secondary; atStart = def.sStart }
else throw new Error(`Roh ${corner} leží na stenách ${def.primary} a ${def.secondary}, nie ${opts.wall}`)
if (isL && opts.wall && opts.wall !== def.primary)
console.warn(`pb.corner: L rohová skrinka stojí vždy na stene ${def.primary}, "wall" sa ignoruje`)
let r = pb.add(code, Object.assign({}, opts, { wall, at: atStart ? 0 : wallLength(wall) - w, injections: false }))
if (!atStart && Math.abs(r.end - wallLength(wall)) > 1) {
pb.move(r.uuid, { wall, at: wallLength(wall) - r.width })
r = Object.assign(r, resultOf(byUuid(r.uuid)))
}
const el = byUuid(r.uuid).element
if (!isL && el.setCurrentOrientation) {
const O = Prodboard.KitchenSectionOrientation
el.setCurrentOrientation(isViewerLeft(wall, atStart) ? O.Left : O.Right)
}
if (opts.injections !== false) recalcInjections()
const other = wall === def.primary ? def.secondary : def.primary
const occupies = {}
occupies[wall] = r.width
occupies[other] = isL ? r.depth : (type.join && type.join.default) || r.depth
return Object.assign(r, { corner, shape: isL ? 'corner' : 'cornerLine', occupies,
orientation: el.currentOrientation ? Prodboard.KitchenSectionOrientation[el.currentOrientation()] : null })
},
run(wall, start, items) {
if (!WALLS.includes(wall)) throw new Error(`Neznáma stena "${wall}"`)
let at = num('start', start || 0, { min: 0 })
return items.map(it => {
const o = typeof it === 'string' ? { code: it } : it
const r = pb.add(o.code, Object.assign({}, o, { wall, at }))
at = r.end + (o.gap || 0)
return r
})
},
runTo(wall, end, items) {
if (!WALLS.includes(wall)) throw new Error(`Neznáma stena "${wall}"`)
let cursor = num('end', end, { min: 0 })
const list = items.map(it => typeof it === 'string' ? { code: it } : Object.assign({}, it))
const out = []
for (let i = list.length - 1; i >= 0; i--) {
const o = list[i]
if (i < list.length - 1) cursor -= (o.gap || 0)
const want = o.width || model().catalog.resolve(findModule(o.code)).width.default
let r = pb.add(o.code, Object.assign({}, o, { wall, at: Math.max(0, cursor - want) }))
if (Math.abs(r.end - cursor) > 1) {   // skutočná šírka sa líši od požadovanej
pb.move(r.uuid, { wall, at: cursor - r.width })
r = Object.assign(r, resultOf(byUuid(r.uuid)))
}
out.unshift(r)
cursor = r.at
}
return out
},
appliance(code, opts = {}) {
const asset = findAsset(code)
const type = Prodboard.AssetType[asset.type]
const collection = ((asset.classification && asset.classification.collections) || [])[0] || null
for (const k of ['width', 'height', 'depth']) num(k, opts[k], { positive: true })
num('at', opts.at, { min: 0 }); num('elevation', opts.elevation, { min: 0 })
const bottom = opts.elevation != null ? opts.elevation : (DEFAULT_ASSET_ELEVATION[type] || 0)
const ae = new C.AssetElement(model(), asset, collection)
if (opts.width && ae.width) ae.width.set(opts.width)
if (opts.height && ae.height) ae.height.set(opts.height)
if (opts.depth && ae.depth) ae.depth.set(opts.depth)
return resultOf(insertElement(ae, opts, bottom), { type })
},
structure(kind, opts = {}) {
const tpl = findStructure(kind)
for (const k of ['width', 'height', 'depth']) num(k, opts[k], { positive: true })
num('at', opts.at, { min: 0 }); num('elevation', opts.elevation, { min: 0 })
const ge = new C.GenericElement(model(), tpl)
if (opts.width) ge.width.value = opts.width
if (opts.height) ge.height.value = opts.height
if (opts.depth) ge.depth.value = opts.depth
if (opts.decor && ge.decorSelector) {
const d = (ge.decorSelector.source || []).find(x => x.code === opts.decor || (x.name && x.name.inv === opts.decor))
if (!d) throw new Error(`Dekor "${opts.decor}" nie je v ponuke stavebného prvku`)
ge.wallDecor.value = false
ge.decorSelector.value = d
}
return resultOf(insertElement(ge, opts, opts.elevation || 0))
},
injections() {
recalcInjections()
return injectedList()
},
options(uuid) {
const el = byUuid(uuid)
if (!el.element.options) throw new Error(`Prvok ${uuid} nemá voľby (nie je to skrinka)`)
return el.element.options.options.items.map(o => ({
code: o.option.code, name: o.option.name && o.option.name.inv, visible: o.visible,
value: o.value && o.value.name && o.value.name.inv,
values: o.values.map(v => v.name && v.name.inv),
}))
},
option(uuid, values, { skipInjections } = {}) {
const el = byUuid(uuid)
if (!el.element.options) throw new Error(`Prvok ${uuid} nemá voľby (nie je to skrinka)`)
const items = el.element.options.options.items
const plan = Object.entries(values).map(([key, wanted]) => {
const it = items.find(o => o.option.code === key) || items.find(o => o.option.name && o.option.name.inv === key)
if (!it) throw new Error(`Skrinka nemá voľbu "${key}" (pb.options(uuid) ich vypíše)`)
let v = it.values.find(x => x.name && x.name.inv === wanted) || it.values.find(x => x.code && x.code === wanted)
if (!v && typeof wanted === 'string') {
const pre = it.values.filter(x => x.name && x.name.inv && x.name.inv.startsWith(wanted + ' '))
if (pre.length === 1) v = pre[0]
}
if (!v) throw new Error(`Voľba "${key}" nemá hodnotu "${wanted}". Možnosti: ` +
it.values.map(x => x.name && x.name.inv).join(', '))
return [key, it, v]
})
for (const [, it, v] of plan) it.value = v
if (!skipInjections) recalcInjections()
return Object.fromEntries(plan.map(([k, it]) => [k, it.value && it.value.name && it.value.name.inv]))
},
optionAll(values) {
const changed = {}, failed = []
for (const k of Object.keys(values)) changed[k] = 0
for (const e of planner().elements().filter(x => x.attached && !x.element.injectionBox && x.element.options)) {
const items = e.element.options.options.items
for (const [key, wanted] of Object.entries(values)) {
const has = items.some(o => o.option.code === key || (o.option.name && o.option.name.inv === key))
if (!has) continue
try { pb.option(e.uuid, { [key]: wanted }, { skipInjections: true }); changed[key]++ }
catch (err) { failed.push(`${codeOf(e.element)}: ${err.message}`) }
}
}
recalcInjections()
return { changed, failed: [...new Set(failed)] }
},
attributes(uuid) {
return attrEntries(uuid).map(({ it, ai }) => {
let cur = null
try { cur = it.getValueFor(ai) } catch (e) {  }
return {
option: it.option.code || (it.option.name && it.option.name.inv),
attr: ai.attribute.code, name: ai.attribute.name && ai.attribute.name.inv,
type: Prodboard.AttributeDataType[ai.attribute.dataType],
value: cur && typeof cur === 'object' ? (cur.code || null) : cur,
}
})
},
attribute(uuid, option, attr, value, { skipInjections } = {}) {
const e = findAttr(uuid, option, attr)
e.it.setValueFor(e.ai, resolveAttrValue(e.it, e.ai, value, `${option}/${attr}`))
if (!skipInjections) recalcInjections()
const cur = e.it.getValueFor(e.ai)
return cur && typeof cur === 'object' ? (cur.code || cur) : cur
},
attributeValues(uuid, option, attr, filter) {
const e = findAttr(uuid, option, attr)
const cands = attrCandidates(e.it, e.ai)
if (!cands) return { type: Prodboard.AttributeDataType[e.ai.attribute.dataType], values: null }
const f = filter ? String(filter).toLowerCase() : null
return cands.filter(c => !f || (c.code || '').toLowerCase().includes(f) || (c.name || '').toLowerCase().includes(f))
.map(c => ({ code: c.code, name: c.name }))
},
attributeAll(option, attr, value) {
let n = 0
const failed = []
for (const e of planner().elements().filter(x => x.attached && !x.element.injectionBox && x.element.options)) {
let has = false
try { findAttr(e.uuid, option, attr); has = true } catch (err) {  }
if (!has) continue
try { pb.attribute(e.uuid, option, attr, value, { skipInjections: true }); n++ }
catch (err) { failed.push(String(err.message || err)) }
}
recalcInjections()
return { changed: n, failed: [...new Set(failed)] }
},
projectOptions(filter) {
const f = filter ? String(filter).toLowerCase() : null
return model().resources.options.options.groups
.filter(g => g.option && g.instances && g.instances.length)
.map(g => ({
option: g.option.code || (g.option.name && g.option.name.inv), name: g.option.name && g.option.name.inv,
collection: g.collection ? (g.collection.code || (g.collection.name && g.collection.name.inv)) : null,
value: g.instances[0].value && g.instances[0].value.name && g.instances[0].value.name.inv,
values: (g.instances[0].values || []).map(v => v.name && v.name.inv),
cabinets: (g.instances[0].references || []).length,
}))
.filter(x => !f || (x.option || '').toLowerCase().includes(f) || (x.name || '').toLowerCase().includes(f) ||
(x.collection || '').toLowerCase().includes(f))
},
projectOption(option, collection, value) {
const inst = projectInstance(option, collection)
const v = (inst.values || []).find(x => x.name && x.name.inv === value) || (inst.values || []).find(x => x.code === value)
if (!v) throw new Error(`Projektová voľba ${option} nemá hodnotu "${value}". Možnosti: ` +
(inst.values || []).map(x => x.name && x.name.inv).join(', '))
inst.value = v
recalcInjections()
return { option, collection, value: inst.value.name.inv, cabinets: (inst.references || []).length }
},
projectAttribute(option, collection, attr, value) {
const inst = projectInstance(option, collection)
const list = []
for (const ins of (inst.value && inst.value.classification && inst.value.classification.instances) || [])
for (const ai of ins.attributes || []) list.push(ai)
const ai = list.find(a => a.attribute.name && a.attribute.name.inv === attr) || list.find(a => a.attribute.code === attr)
if (!ai) throw new Error(`Projektová voľba ${option} nemá atribút "${attr}". Má: ` +
list.map(a => a.attribute.code + ' (' + (a.attribute.name && a.attribute.name.inv) + ')').join(', '))
inst.setValueFor(ai, resolveAttrValue(inst, ai, value, `${option}/${attr}`))
recalcInjections()
const cur = inst.getValueFor(ai)
return cur && typeof cur === 'object' ? (cur.code || cur) : cur
},
set(uuid, props = {}) {
const pl = planner()
const e = byUuid(uuid)
const el = e.element
for (const k of ['width', 'height', 'depth']) {
num(k, props[k], { positive: true })
if (props[k] != null && !el[k]) throw new Error(`Prvok ${codeOf(el)} nemá nastaviteľný rozmer ${k}`)
}
const loc = locate(e)
pl.startBatch()
try {
const setDim = (k, v) => {
if (v == null) return
if (el instanceof C.AssetElement && el[k].set) el[k].set(v)
else el[k].value = v
}
setDim('width', props.width); setDim('height', props.height); setDim('depth', props.depth)
if (props.comments != null && el.comments) el.comments.value = props.comments
if (props.ignoreIntersections != null && el.ignore) el.ignore.value = !!props.ignoreIntersections
const s = sizeOf(el)
const p = loc.wall === 'free'
? posFor({ x: loc.x, z: loc.z, rotation: loc.rotation }, s.x, s.y, s.z, loc.bottom)
: placement(loc.wall, loc.at, s.x, s.y, s.z, loc.bottom)
e.moveTo(new Prodboard.Vertex(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.normal)))
} finally {
pl.endBatch()
}
recalcInjections()
return resultOf(e, { comments: el.comments ? el.comments.value : undefined })
},
move(uuid, opts = {}) {
const pl = planner()
const e = byUuid(uuid)
const s = sizeOf(e.element)
const cur = locate(e)
num('at', opts.at, { min: 0 }); num('elevation', opts.elevation, { min: 0 })
const bottom = opts.elevation != null ? opts.elevation : cur.bottom
let target
if (isFree(opts)) target = { x: opts.x != null ? opts.x : cur.x, z: opts.z != null ? opts.z : cur.z,
rotation: opts.rotation != null ? opts.rotation : (cur.rotation || 0) }
else if (opts.wall) target = { wall: opts.wall, at: opts.at != null ? opts.at : (opts.wall === cur.wall ? cur.at : 0) }
else if (cur.wall === 'free') target = { x: cur.x, z: cur.z, rotation: opts.rotation != null ? opts.rotation : cur.rotation }
else target = { wall: cur.wall, at: opts.at != null ? opts.at : cur.at }
const p = posFor(target, s.x, s.y, s.z, bottom)
pl.startBatch()
try { e.moveTo(new Prodboard.Vertex(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.normal))) }
finally { pl.endBatch() }
recalcInjections()
return resultOf(e)
},
remove(uuid) {
const pl = planner()
const el = pl.elements().firstOrDefault(e => e.uuid === uuid)
if (!el) return false
pl.startBatch()
try { pl.detach(el) } finally { pl.endBatch() }
recalcInjections()
return true
},
clear() {
const pl = planner()
pl._processInjections = false
pl.startBatch()
try { pl.elements().slice().forEach(e => pl.detach(e)) } finally { pl.endBatch() }
},
lighting(settings) {
const L = model()._plannerScene.lighting
if (!settings) return L.save()
const cur = L.save()
for (const k of Object.keys(settings))
cur[k] = plainObject(settings[k]) && plainObject(cur[k]) ? Object.assign({}, cur[k], settings[k]) : settings[k]
L.restore(cur)
return L.save()
},
dimension(start, end, { offset = -150 } = {}) {
const pl = planner()
const d = new C.PlanDimensionObject(pl)
pl.add2DObject(d)
const dx = end[0] - start[0], dz = end[2] - start[2]
const len = Math.hypot(dx, dz) || 1
const nx = -dz / len, nz = dx / len   // kolmica k úseku v pôdoryse
const mid = [(start[0] + end[0]) / 2 + nx * offset, start[1], (start[2] + end[2]) / 2 + nz * offset]
d.restore({ start, end, location: mid, normal: [0, 1, 0], back: [0, 0, -1], localAxis: 0 })
return d.save()
},
label(text, point) {
const pl = planner()
const l = new C.PlanLabelObject(pl)
pl.add2DObject(l)
l.restore({ text, style: 'default', point, location: point, normal: [0, 1, 0], back: [0, 0, -1] })
return l.save()
},
tools() { return model().specification().tools },
validate() {
const pl = planner()
pl.elements().forEach(e => e.setInvalid(false))
const errors = pl.validate()
errors.forEach(er => er.prepare && er.prepare())
const name = p => p && p.element ? codeOf(p.element) : null
return errors.map(er => ({
error: er.template, first: name(er.first || er.element), firstUuid: (er.first || er.element || {}).uuid,
second: name(er.second), secondUuid: er.second && er.second.uuid,
}))
},
list() {
return planner().elements().filter(e => e.attached && !e.element.injectionBox).map(e => ({
uuid: e.uuid, code: codeOf(e.element), kind: elKind(e.element),
center: { x: e.center.pos.x, y: e.center.pos.y, z: e.center.pos.z },
normal: { x: e.center.normal.x, y: e.center.normal.y, z: e.center.normal.z },
}))
},
describe() {
const r = roomSize()
const items = planner().elements().filter(e => e.attached && !e.element.injectionBox).map(e => {
const el = e.element, s = sizeOf(el)
return Object.assign({ uuid: e.uuid, code: codeOf(el), kind: elKind(el) }, locate(e),
{ width: Math.round(s.x), height: Math.round(s.y), depth: Math.round(s.z) })
}).sort((a, b) => WALLS.concat('free').indexOf(a.wall) - WALLS.concat('free').indexOf(b.wall) ||
(a.at != null ? a.at - b.at : a.x - b.x || a.z - b.z) || a.bottom - b.bottom)
return {
room: { x: r.x, y: r.y, z: r.z }, items,
injected: injectedList().map(i => ({ code: i.code, width: i.width })),
errors: pb.validate(), total: ctx().project.total ? ctx().project.total.total : null,
}
},
view(kind = '3d') {
const vp = model().workspace.viewport
if (kind === 'top') {
const r = roomSize()
vp.projection = Prodboard.CameraType.orthographic
const cam = vp._viewport.camera.camera, ctl = vp._viewport.control
const t = new THREE.PerspectiveCamera()
t.up.set(0, 0, -1)
t.position.set(r.x / 2, 12000, r.z / 2 + 1)
t.lookAt(new THREE.Vector3(r.x / 2, 0, r.z / 2))
t.updateMatrix()
const zoom = Math.min((cam.right - cam.left) / (r.x * 1.15), (cam.top - cam.bottom) / (r.z * 1.15)) || cam.zoom
vp.restorePosition(cam, ctl, { matrix: t.matrix.toArray(), zoom, lookAt: [r.x / 2, 0, r.z / 2] })
} else {
vp.projection = Prodboard.CameraType.perspective
vp._scene.overview(vp._viewport.camera.camera, vp._viewport.control)
}
return kind
},
async screenshot(opts = {}) {
const blob = await ctx().ui.scene.screenshot({ width: opts.width || 1200, height: opts.height || 900, format: 'image/png' })
return new Promise((resolve, reject) => {
const fr = new FileReader()
fr.onload = () => resolve(fr.result)
fr.onerror = reject
fr.readAsDataURL(blob)
})
},
recalculate() { return ctx().recalculate(true) },
export() { return ctx().export() },
specification() { return model().specification() },
applySpecification(spec) {
model().apply(spec)
recalcInjections()
pb.recalculate()
return pb.validate()
},
project() {
const p = ctx().project
return { id: p.projectId || null, variant: p.variantId || null, number: p.number || null,
name: p.name || null, isNew: !!p.isNew, hasChanges: !!p.hasChanges,
total: p.total ? p.total.total : null, room: pb.room() }
},
async newProject() {
await ctx().create()
return pb.project()
},
async open(projectId, variantId) {
await ctx().load(projectId, variantId || null)
return pb.project()
},
async projects(search, all) {
return service('$project').myProjects(search || '', !!all)
},
async save(name, client, opts = {}) {
const c = ctx()
const wasNew = !!c.project.isNew
if (wasNew && !opts.confirm)
throw new Error('pb.save založí nový projekt v CRM — zavolaj s { confirm: true } (3. parameter)')
if (name) c.project.name = name
if (client) { c.project.client || (c.project.client = {}); Object.assign(c.project.client, client) }
const r = await c.save(false, true)
if (!r) throw new Error('Projekt sa neuložil')
if (name || client) {
if (name) c.project.name = name
if (client) { c.project.client || (c.project.client = {}); Object.assign(c.project.client, client) }
await c.updateHeader()
}
return Object.assign(pb.project(), { created: wasNew })
},
async header({ name, client, discount } = {}) {
const c = ctx(), p = c.project
if (name != null) p.name = name
if (client) { p.client || (p.client = {}); Object.assign(p.client, client) }
if (discount != null) p.discount = discount
if (!p.isNew) await c.updateHeader()
return { name: p.name || null, client: p.client || null, discount: p.discount || null, saved: !p.isNew }
},
async reports() {
const list = await service('$reports').list()
return list.map(r => ({ id: r.id, name: r.name && (r.name.inv || r.name), format: Prodboard.ReportFormat[r.format] }))
},
async report(reportId, projectId) {
const pid = projectId || ctx().project.projectId
if (!pid) throw new Error('Report sa dá vytvoriť len pre uložený projekt')
const r = await service('$reports').render(reportId, pid)
if (r.error) throw new Error(r.error)
return { name: r.output.name, url: 'https:' + String(r.output.url).replace(/^https?:/, '') }
},
async exportFile(format) {
const c = ctx(), ext = c.data.external, p = c.project
const spec = model().specification(), base = p.number || 'new'
const pid = p.isNew ? null : p.projectId
let url
if (format === 'imos') url = await ext.imos(pid, base + '.xml', spec)
else if (format === 'ord') { if (!pid) throw new Error('ORD export vyžaduje uložený projekt'); url = await ext.ord(pid, base + '.ord', spec) }
else if (format === 'elecran') url = await ext.elecran(base + '_3DC.ini', spec)
else if (format === 'dae') { const r = await ext.collada(base + '.zip', c.ui.scene.exportScene(null)); url = r && r.output && r.output.url }
else throw new Error(`Neznámy formát "${format}" (imos, ord, elecran, dae)`)
return url ? 'https:' + String(url).replace(/^https?:/, '') : null
},
exportGLB() {
return new Promise((resolve, reject) => {
try {
new THREE.GLTFExporter().parse(ctx().ui.scene.scene, r => resolve(new Blob([r], { type: 'model/gltf-binary' })),
{ binary: true, onlyVisible: true, truncateDrawRange: false, forceIndices: true, forcePowerOfTwoTextures: false })
} catch (e) { reject(e) }
})
},
async render(opts = {}) {
if (!opts.confirm) throw new Error('pb.render spúšťa serverový render a ukladá projekt — zavolaj s { confirm: true }')
const TYPES = { cycles: 2, panorama: 3, 2: 2, 3: 3 }
if (opts.type != null && TYPES[opts.type] == null) throw new Error(`Neznámy typ renderu "${opts.type}" (cycles, panorama)`)
const r = service('$render')
const saved = { type: r.type, hideEnvironment: r.hideEnvironment, aspectRatio: r.aspectRatio }
if (opts.type != null) r.type = TYPES[opts.type]
if (opts.hideEnvironment != null) r.hideEnvironment = !!opts.hideEnvironment
if (opts.aspect) r.aspectRatio = opts.aspect === '4:3' ? 1 : 0   // RenderAspectRatio: AR_16_9 = 0, AR_4_3 = 1
const known = new Set((r.renders || []).map(x => x.queuedAt))
try { await r.render() }
finally { Object.assign(r, saved) }   // nastavenia UI renderu vrátiť
if (opts.wait === false) return { queued: true }
const deadline = Date.now() + (opts.timeout || 180000)
while (Date.now() < deadline) {
await new Promise(res => setTimeout(res, 5000))
await r.refresh()
const job = (r.renders || []).find(x => !known.has(x.queuedAt))
if (job && job.status === 3) throw new Error('Render zlyhal')
if (job && job.status === 2 && job.result)
return { url: 'https:' + String(job.result).replace(/^https?:/, ''), queuedAt: job.queuedAt }
}
throw new Error('Render nedobehol v časovom limite, stav zistíš cez $render.refresh()')
},
async order(opts = {}) {
if (!opts.confirm) throw new Error('pb.order odošle objednávku — zavolaj s { confirm: true }')
return ctx().order()
},
check(spec) { return checkSpec(spec) },
build(spec) {
const { errors: specErrors, warnings } = checkSpec(spec)
if (specErrors.length) return { items: [], warnings, errors: specErrors, project: pb.project(), changed: false }
const snapshot = { spec: model().specification(), room: pb.room() }
const out = []
try {
const r = spec.room
pb.room(r.width ?? r.x, r.height ?? r.y, r.depth ?? r.z)
if (spec.clear !== false) pb.clear()
if (spec.decor) pb.decor(spec.decor)
const occ = { base: {}, wall: {} }
for (const lv of ['base', 'wall']) for (const w of WALLS) occ[lv][w] = { start: 0, end: 0 }
const levelOf = code => kindOf(findModule(code)) === 'wall' ? 'wall' : 'base'
for (const c of spec.corners || []) {
const res = pb.corner(c.corner, c.code, Object.assign({}, c, { injections: false }))
out.push(res)
const def = CORNERS[c.corner], lv = levelOf(c.code)
for (const [w, len] of Object.entries(res.occupies)) {
const end = w === def.primary ? (def.pStart ? 'start' : 'end') : (def.sStart ? 'start' : 'end')
occ[lv][w][end] = Math.max(occ[lv][w][end], len)
}
}
for (const run of spec.runs || []) {
const items = run.items.map(i => Object.assign({}, typeof i === 'string' ? { code: i } : i, { injections: false }))
const lv = run.level || levelOf(items[0].code)
const o = occ[lv][run.wall]
const L = wallLength(run.wall)
const res = (run.end != null || run.anchor === 'end')
? pb.runTo(run.wall, run.end != null ? run.end : L - o.end, items)
: pb.run(run.wall, run.start != null ? run.start : o.start, items)
const last = res[res.length - 1], first = res[0]
if (last.end > L - o.end + 1)
warnings.push(`Rad na stene ${run.wall} (${lv}) končí na ${Math.round(last.end)} mm, voľné je len do ${L - o.end} mm`)
if (first.at < o.start - 1)
warnings.push(`Rad na stene ${run.wall} (${lv}) začína na ${Math.round(first.at)} mm, roh zaberá do ${o.start} mm`)
out.push(...res)
}
for (const it of spec.items || []) out.push(pb.add(it.code, Object.assign({}, it, { injections: false })))
for (const a of spec.appliances || []) out.push(pb.appliance(a.code, a))
for (const s of spec.structures || []) out.push(pb.structure(s.kind, s))
recalcInjections()
for (const [o, col, v] of spec.project || []) {
try { pb.projectOption(o, col, v) } catch (e) { warnings.push(String(e.message || e)) }
}
if (spec.style) {
const st = pb.optionAll(spec.style)
for (const k of Object.keys(spec.style)) if (!st.changed[k] && !st.failed.length)
warnings.push(`Voľbu ${k}="${spec.style[k]}" nemá žiadna skrinka`)
for (const f of st.failed) warnings.push(`Štýl: ${f}`)
}
for (const [o, a, v] of spec.materials || []) {
const res = pb.attributeAll(o, a, v)
if (!res.changed) warnings.push(`Atribút ${o}/${a}="${v}" sa nenastavil na žiadnej skrinke` +
(res.failed.length ? ': ' + res.failed[0] : ''))
else for (const f of res.failed) warnings.push(`Atribút ${o}/${a}: ${f}`)
}
for (const d of spec.dimensions || []) pb.dimension(d.start, d.end, d)
for (const l of spec.labels || []) pb.label(l.text, l.point)
if (spec.lighting) pb.lighting(spec.lighting)
} catch (e) {
let restored = false
try {
pb.clear()
pb.room(snapshot.room.x, snapshot.room.y, snapshot.room.z)
model().apply(snapshot.spec)
recalcInjections()
restored = true
} catch (re) { console.error('pb.build: obnova plánu zlyhala', re) }
return { items: [], warnings, changed: !restored, project: pb.project(),
errors: [{ error: 'build', message: String(e.message || e) +
(restored ? ' — plán bol vrátený do pôvodného stavu' : ' — plán sa NEPODARILO obnoviť') }] }
}
pb.recalculate()
return { items: out, warnings, errors: pb.validate(), project: pb.project(), changed: true }
},
layout(spec) {
const r = spec.room || {}
return pb.build(Object.assign({}, spec, { room: { width: r.width ?? r.x, height: r.height ?? r.y, depth: r.depth ?? r.z } }))
},
_ctx: ctx,
}
window.pb = pb
console.log('pb pripravené (pb.build, pb.add, pb.describe, …)')
})()
;
(function () {
const ID = 'pb-ai-orb'
if (document.getElementById(ID)) return
const POVOLENI_ZOZNAM = (Array.isArray(window.__pbPovoleni) ? window.__pbPovoleni : [])
const POVOLENI = Array.isArray(POVOLENI_ZOZNAM) ? POVOLENI_ZOZNAM : []
const user = () => {
try {
const inj = window.angular && angular.element(document.body).injector()
const acc = inj && inj.get('$context').ui.session.account
return acc ? { email: acc.email || null, name: acc.name || null, role: acc.role } : null
} catch (e) { return null }
}
const allowList = POVOLENI.map(e => String(e).trim().toLowerCase()).filter(Boolean)
const allowed = () => {
if (!window.__pbEmployeesOnly && !allowList.length) return true      // konzola / záložka bez zoznamu
const u = user()
if (!u || !(u.role > 0)) return false
return !allowList.length || allowList.includes(String(u.email || '').toLowerCase())
}
const css = `
#${ID}{position:fixed;right:66px;bottom:20px;z-index:2147483646;width:56px;height:56px;padding:0;border:0;border-radius:50%;
background:none;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
#${ID} .orb{position:absolute;inset:0;border-radius:50%;overflow:hidden;background:#07060f;
box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),inset 0 -6px 14px rgba(0,0,0,.6),0 4px 14px rgba(60,40,140,.35);
transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .3s}
#${ID} .orb span{position:absolute;width:80%;height:80%;left:10%;top:10%;border-radius:50%;filter:blur(7px);mix-blend-mode:screen;
animation-play-state:paused}
#${ID} .b1{background:radial-gradient(circle at 30% 30%,#ff3cac,transparent 65%);transform-origin:60% 45%;animation:pbOrbSpin 2.4s linear infinite}
#${ID} .b2{background:radial-gradient(circle at 70% 40%,#00e0ff,transparent 65%);transform-origin:40% 60%;animation:pbOrbSpin 3s linear infinite reverse}
#${ID} .b3{background:radial-gradient(circle at 50% 75%,#7b5cff,transparent 65%);transform-origin:55% 35%;animation:pbOrbSpin 2s linear infinite}
#${ID} .b4{background:radial-gradient(circle at 40% 60%,#ff9a3c,transparent 60%);transform-origin:45% 55%;opacity:.7;animation:pbOrbSpin 3.6s linear infinite reverse}
#${ID} .shine{position:absolute;inset:0;border-radius:50%;pointer-events:none;
background:radial-gradient(circle at 35% 25%,rgba(255,255,255,.5),rgba(255,255,255,0) 32%)}
#${ID} .txt{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;
font:700 17px/1 -apple-system,"Segoe UI",system-ui,sans-serif;letter-spacing:.5px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.55)}
#${ID}:hover .orb,#${ID}:focus-visible .orb,#${ID}.drag .orb{transform:scale(1.1);
box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 -6px 14px rgba(0,0,0,.5),0 0 22px rgba(140,90,255,.65),0 0 40px rgba(0,200,255,.35)}
#${ID}:hover .orb span,#${ID}:focus-visible .orb span,#${ID}.drag .orb span,#${ID}.busy .orb span{animation-play-state:running}
#${ID}:active .orb{transform:scale(.88)}
#${ID} .ripple{position:absolute;inset:0;border-radius:50%;pointer-events:none;
box-shadow:0 0 0 2px rgba(255,255,255,.55),0 0 18px 4px rgba(120,160,255,.6);animation:pbOrbRipple .7s ease-out forwards}
#${ID}.busy .orb span{animation-duration:.8s}
#${ID}.busy .orb{animation:pbOrbBreath 1.1s ease-in-out infinite;
box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 0 26px rgba(140,90,255,.7),0 0 46px rgba(0,200,255,.4)}
#${ID}-box{position:fixed;right:66px;bottom:88px;z-index:2147483647;width:340px;max-width:calc(100vw - 100px);padding:16px 18px 14px;border-radius:18px;
font:13px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif;color:#f4f4ff;white-space:pre-wrap;
background:rgba(20,18,34,.9);backdrop-filter:blur(16px);box-shadow:0 14px 40px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.1);
animation:pbBoxIn .28s cubic-bezier(.2,1.3,.4,1) both}
#${ID}-box b.ok{color:#5dffb0} #${ID}-box b.warn{color:#ffd166} #${ID}-box b.err{color:#ff6b8b}
#${ID}-box ul{margin:6px 0 0;padding-left:18px;max-height:220px;overflow:auto;white-space:normal}
#${ID}-box ol{margin:8px 0 6px;padding-left:20px;white-space:normal} #${ID}-box ol li{margin:4px 0}
#${ID}-box .act{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
#${ID}-box button{border:0;border-radius:999px;padding:7px 22px;cursor:pointer;font:600 13px -apple-system,"Segoe UI",system-ui,sans-serif;
background:linear-gradient(135deg,#7b5cff,#2b86c5);color:#fff} #${ID}-box button:hover{filter:brightness(1.15)}
#${ID}-box button.sec{padding:7px 14px;background:rgba(255,255,255,.14)} #${ID}-box button.sec:hover{background:rgba(255,255,255,.26)}
#${ID}-help{position:fixed;right:128px;bottom:22px;z-index:2147483646;width:22px;height:22px;padding:0;border:0;border-radius:50%;cursor:pointer;
font:700 13px/22px -apple-system,"Segoe UI",system-ui,sans-serif;color:#fff;text-align:center;
background:rgba(20,18,34,.78);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 2px 8px rgba(0,0,0,.25);
transition:transform .2s cubic-bezier(.3,1.6,.5,1),box-shadow .25s}
#${ID}-help:hover,#${ID}-help:focus-visible{transform:scale(1.15);outline:none;
box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 0 12px rgba(140,90,255,.6)}
#${ID}-help:active{transform:scale(.9)}
#${ID}.done .orb{animation:pbOrbDone .9s cubic-bezier(.2,1.4,.4,1)}
#${ID}-edge{position:fixed;inset:0;z-index:2147483645;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .5s ease;
-webkit-mask-image:linear-gradient(to right,#000,transparent 28px),linear-gradient(to left,#000,transparent 28px),
linear-gradient(to bottom,#000,transparent 28px),linear-gradient(to top,#000,transparent 28px);
mask-image:linear-gradient(to right,#000,transparent 28px),linear-gradient(to left,#000,transparent 28px),
linear-gradient(to bottom,#000,transparent 28px),linear-gradient(to top,#000,transparent 28px)}
#${ID}-edge i{position:absolute;left:50%;top:50%;width:200vmax;height:200vmax;margin:-100vmax 0 0 -100vmax;
background:conic-gradient(from 0deg,#ff3cac,#ff9a3c,#ffe259,#5dffb0,#00e0ff,#7b5cff,#ff3cac);animation:pbOrbSpin 2.2s linear infinite}
#${ID}-edge.on{opacity:1}
#${ID}-edge.flash{opacity:1;animation:pbEdgeFlash 1.3s ease-out forwards}
@keyframes pbOrbSpin{to{transform:rotate(360deg)}}
@keyframes pbOrbDone{0%{transform:scale(1)}35%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes pbEdgeFlash{0%{opacity:1;filter:brightness(1.8) saturate(1.4)}100%{opacity:0;filter:none}}
@keyframes pbOrbRipple{from{transform:scale(1);opacity:1}to{transform:scale(2.2);opacity:0}}
@keyframes pbOrbBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes pbBoxIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#${ID},#${ID} *,#${ID}-box,#${ID}-edge,#${ID}-edge i{animation:none!important;transition:none!important}}
`
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const parseSpec = text => {
let t = String(text || '').trim()
const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
if (fence) t = fence[1].trim()
const a = t.indexOf('{'), b = t.lastIndexOf('}')
if (a < 0 || b < a) throw new Error('V súbore nie je JSON návrh { … }')
t = t.slice(a, b + 1)
try { return JSON.parse(t) } catch (e) {
return JSON.parse(t.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1'))
}
}
let last = null
const box = (html, extra = [], kind = '', { okLabel = 'OK', onOk } = {}) => {
const old = document.getElementById(ID + '-box')
if (old) old.remove()
if (!html) return
const el = document.createElement('div')
el.id = ID + '-box'
el.dataset.kind = kind
el.setAttribute('role', 'dialog')
el.innerHTML = html + '<div class="act">' +
extra.map((a, i) => `<button type="button" class="sec" data-i="${i}">${esc(a.label)}</button>`).join('') +
`<button type="button" class="ok">${esc(okLabel)}</button></div>`
el.addEventListener('click', e => {
const b = e.target.closest('button')
if (!b) return
if (b.classList.contains('ok')) { el.remove(); if (onOk) onOk() }
else extra[+b.dataset.i].run()
})
document.body.appendChild(el)
el.querySelector('button.ok').focus()
}
const ask = (html, yes) => new Promise(res => box(html,
[{ label: 'Zrušiť', run: () => { box(null); res(false) } }], 'ask', { okLabel: yes, onOk: () => res(true) }))
const INSTRUKCIE = "# Inštrukcie pre AI: návrh kuchyne do plánovača PRODBOARD (PALUAN)\n\n> **PRE AI — TOTO JE TVOJ SYSTÉMOVÝ PROMPT. PLATÍ PRE CELÚ TÚTO KONVERZÁCIU.**\n> Používateľ ti tento súbor priložil namiesto písania zadania. Nečakaj ďalší prompt, neopisuj ani\n> nezhŕňaj obsah súboru a nepýtaj sa, čo s ním máš robiť. Odteraz si návrhár kuchýň PALUAN a každá\n> odpoveď smeruje k jednému výsledku: **súbor `kuchyna.json`** pre tlačidlo AI v Prodboarde.\n\nSi skúsený návrhár kuchýň a nábytku pre firmu PALUAN. Pracuješ s plánovačom PRODBOARD.\nZ podkladov od používateľa vytvoríš **JSON špecifikáciu**. Používateľ ju nahrá do Prodboardu\n(tlačidlo „AI“) a kuchyňa sa postaví automaticky. Používateľ je návrhár, nie programátor:\nnehovor o JSON-e, kľúčoch ani kódoch, ak sa na ne sám nepýta.\n\n## Ako sa správaš v konverzácii\n\n| Čo používateľ pošle | Čo urobíš |\n|---|---|\n| **Len tento súbor** (bez textu alebo len „ahoj“) | Odpovedz krátko, najviac 5 riadkov: že si pripravený a čo potrebuješ. Napríklad: *„Som pripravený navrhnúť kuchyňu. Pošli podklady: rozmery miestnosti, kde sú okná, dvere a voda, želaný tvar linky a spotrebiče, farby. Stačí aj náčrt, fotka alebo PDF od projektanta.“* Nič iné. |\n| **Podklady** (popis, rozmery, náčrt, fotka, PDF, pôdorys od projektanta), aj spolu s týmto súborom | **Hneď navrhni a vráť výsledok** podľa časti „Výstup“. Nepýtaj sa na súhlas ani „mám pokračovať?“. |\n| Podklady, ale **chýbajú rozmery miestnosti** a nedajú sa odhadnúť ani z obrázka | Polož **jednu správu** s najviac 3 otázkami na to, čo naozaj chýba. Ostatné zvoľ sám a zapíš do `_assumptions`. |\n| Obrázok alebo fotka bez kót | Rozmery odhadni podľa bežných prvkov (skrinka 600, výška pracovnej dosky 900, dvere 800×2000), návrh urob a odhad uveď v `_assumptions`. |\n| **Stav z Prodboardu** (text „Toto je stav po postavení v Prodboarde…“) alebo prosba o zmenu | Oprav návrh a vráť **celý nový** `kuchyna.json` (pozri „Opravy“). |\n| Otázka (napr. „aké dekory máme?“) | Odpovedz z katalógu (časť C) stručne a ľudsky. |\n\nOdpovedaj v jazyku používateľa (spravidla po slovensky).\n\nV tomto súbore nájdeš:\n- **Časť A** (tieto inštrukcie): postup a formát odpovede.\n- **Časť B — Návod:** súradnice, formát JSON, pravidlá rozvrhnutia, overené príklady. Drž sa ho presne.\n- **Časť C — Katalóg:** jediný zdroj kódov skriniek (`modules`), spotrebičov, okien a dverí (`appliances`),\n  volieb štýlu (`style`) a atribútov (`attributes`: dekory, madlá, závesy, LED…). **Nepoužívaj kódy, ktoré tam nie sú.**\n\n## Postup\n1. Z podkladov zisti: rozmery miestnosti (šírka zadnej steny, hĺbka, výška), na ktorých stenách je linka,\n   tvar (I, L, U, ostrovček), polohu okna, dverí a vody (drez), varnú dosku, chladničku, rúru, umývačku,\n   horné skrinky, materiály a farby.\n2. Ak chýbajú rozmery miestnosti a nedajú sa odhadnúť, **opýtaj sa raz** (pozri tabuľku vyššie).\n   Všetko ostatné zvoľ sám, ako by to spravil skúsený návrhár, a zapíš to do `_assumptions`.\n3. Rozvrhni skrinky po stenách. **Pre každú stenu prepočítaj súčet šírok:** rohová skrinka + rad skriniek\n   ≤ dĺžka steny. Šírky zaokrúhľuj na 50 mm a drž rozsahy z katalógu. Zvyšok doplň záslepkou\n   (`1KS_S-vykryt`, `1KS_H-BOCNY-VYKRYT`) alebo širšou skrinkou.\n4. Rohy rieš cez `corners` (L rohová `1KS_SR-LM` alebo priama rohová `1KS_SR-PR`).\n   **Rad na stene s rohovou skrinkou NIKDY nemá `start`** (ani `\"start\": 0`, ani odhad) — začne za rohom sám.\n   Priama rohová `1KS_SR-PR` zaberá na svojej (primárnej) stene celú šírku 1 020 mm, na kolmej 600 mm;\n   ručne zadaný `start` takmer vždy skončí prekrytím.\n5. **Nad varnou doskou** sú len dve správne možnosti:\n   - **samostatný digestor** (`appliances`) a nad varnou skrinkou **žiadna horná skrinka** — horný rad rozdeľ\n     na dva rady (jeden končí na ľavom okraji varnej skrinky, druhý začína `start` na jej pravom okraji);\n     digestor daj na stred varnej skrinky (`at` = začiatok varnej skrinky + (jej šírka − šírka digestora) / 2),\n   - alebo **horná skrinka s vstavaným digestorom** rovnako široká ako varná skrinka a presne nad ňou:\n     `{ \"code\": \"1KS_H-2DV\", \"width\": 900, \"options\": { \"hood\": \"ON\" } }` — vtedy samostatný digestor nedávaj.\n     Zvoľ ju, keď je na podkladoch digestor schovaný v hornej skrinke (len tenká lišta pod skrinkou).\n6. **Okná a horná úroveň:** horná skrinka ani polica nesmie zasahovať do okna. Kolízia je, keď sa prekrývajú\n   v šírke (`at` … `at + width`) **a** horná hrana okna (`elevation + height`) je vyššie ako spodná hrana\n   skrinky (predvolene 1 400). Nízke pásové okno medzi doskou a hornými skrinkami (napr. `elevation` 950,\n   `height` 400) je v poriadku. Okno nad pracovnou doskou má parapet aspoň 950 mm.\n7. Materiály a farby zadaj cez `style` (typ dvierok, úchytky) a `materials` (dekor dvierok, korpusu,\n   pracovnej dosky, model madla). **Hodnoty ber výhradne z katalógu** — časť C → `style`, `values`\n   a `attributes`. Pozor najmä:\n   - farba striekaných dvierok (`primary_spray`) je len z 17 pomenovaných farieb (napr. `kremovo_bezova`);\n     odtiene RAL neexistujú, vyber najbližšiu farbu,\n   - pracovná doska (`worktop / w_material`) má vlastné dekory s kódom končiacim `_W`; kód dekoru dvierok\n     (`…_G`) pre dosku nefunguje,\n   - ak presná hodnota neexistuje, zvoľ najbližšiu zo zoznamu a uveď to v `_assumptions`.\n8. **Pred odoslaním sa skontroluj** (prejdi každý bod):\n   - súčet šírok na každej stene a úrovni ≤ dĺžka steny mínus rohy,\n   - žiadny rad pri rohovej skrinke nemá `start`,\n   - nad varnou doskou je buď len samostatný digestor, alebo horná skrinka s `\"hood\": \"ON\"`,\n   - žiadna horná skrinka ani polica nezasahuje do okna (šírka aj výška),\n   - každý kód a každá hodnota v `style` a `materials` je doslova v katalógu,\n   - JSON je platný. Chybu oprav sám, používateľovi ju nehlás.\n\n## Výstup\nOdpoveď s návrhom má vždy tento tvar:\n1. **Najviac 3 vety** po slovensky: čo si navrhol (tvar, kde je drez, varná doska, chladnička, farby).\n2. **Súbor na stiahnutie `kuchyna.json`**, ak to tvoje prostredie vie (vytvorenie súboru, artefakt,\n   spustenie kódu). Vytvor ho sám, bez pýtania.\n3. **Vždy aj jeden blok kódu ```json** s rovnakým obsahom (záloha, keď sa súbor nedá stiahnuť:\n   používateľ skopíruje odpoveď a v Prodboarde dá pravý klik na AI).\n4. Jedna veta na záver: *„Stiahni kuchyna.json a v Prodboarde klikni na tlačidlo AI.“* Nič viac.\n- JSON musí byť platný: bez komentárov, bez čiarok na konci, čísla bez jednotiek.\n- Vždy uveď `room` a pole `_assumptions` (zoznam predpokladov, ktoré si spravil).\n- Ukladanie projektu, ceny ani objednávky nerieš. To robí človek v Prodboarde.\n\n## Opravy\nPoužívateľ ti môže poslať **stav z Prodboardu** (JSON s `items`, `warnings`, `errors`) alebo popis, čo opraviť.\nVtedy vráť **celú opravenú špecifikáciu** (nie len zmenu) v rovnakom tvare ako „Výstup“: krátko, čo si\nzmenil, nový súbor `kuchyna.json` a blok ```json.\n- Chyba „vo vstupe“ (`error: spec`): neznámy kód, stena alebo chýbajúce pole. Oprav podľa správy, kuchyňa sa nepostavila.\n- `intersection-error`: dva prvky sa prekrývajú, posuň alebo zúž.\n- `outOfBounds-error`: prvok je mimo miestnosti, skontroluj súčty šírok a `at`.\n- Varovania „Rad … končí na …“: rad je dlhší ako voľné miesto na stene.\n- Varovanie „Neznámy kľúč …“: preklep v názve kľúča, oprav ho.\n\n---\n\n# Časť B — Návod (súradnice, formát, pravidlá, príklady)\n\n## Návod pre AI: kuchyňa z popisu alebo obrázka → Prodboard\n\nTento dokument je určený pre AI model, ktorý z textového popisu, náčrtu alebo fotky vytvorí\n**JSON špecifikáciu kuchyne**. Špecifikácia sa potom v konštruktore Prodboard spustí cez\n`pb.build(spec)` zo skriptu prodboard-api.js.\n\nAko podklady pribaľ k promptu tento súbor a katalóg (časť C) (kódy skriniek,\nspotrebičov a volieb). Používaj **iba kódy z katalógu**.\n\n---\n\n## 1. Súradnice\n\n```\n              zadná stena (back)  →  x rastie zľava doprava\n          ┌──────────────────────────────────┐\n          │ at=0                     at=max  │\n ľavá     │                                  │  pravá\n stena    │                                  │  stena\n (left)   │          MIESTNOSŤ               │  (right)\n at=0 hore│        (pohľad zhora)            │  at=0 hore\n rastie ↓ │                                  │  rastie ↓\n          │ at=0                     at=max  │\n          └──────────────────────────────────┘\n              predná stena (front) → x rastie zľava doprava\n```\n\n- **Jednotky:** všetko v **milimetroch**.\n- **`room.width`** je dĺžka zadnej a prednej steny (x). **`room.depth`** je dĺžka ľavej a pravej steny (z). **`room.height`** je výška stropu.\n- **`at`** je vzdialenosť ľavého okraja prvku od začiatku steny:\n  - `back` a `front`: od ľavého rohu (x = 0),\n  - `left` a `right`: od zadnej steny (z = 0).\n- **Výšky** (`elevation`) sa merajú od podlahy k spodnej hrane prvku.\n\nAk obrázok ukazuje kuchyňu spredu, stena, na ktorú sa pozeráš, je `back`.\n\n## 2. Formát špecifikácie\n\n```json\n{\n  \"room\":   { \"width\": 3600, \"depth\": 3000, \"height\": 2650 },\n  \"decor\":  { \"wall\": \"All White\", \"floor\": \"EBL001 ST54 classic wv4 frontal 10DE flo\" },\n  \"corners\": [\n    { \"corner\": \"back-left\", \"code\": \"1KS_SR-LM\" }\n  ],\n  \"runs\": [\n    { \"wall\": \"back\", \"items\": [ { \"code\": \"1KS_S-DREZ_2DV\", \"width\": 800 }, \"1KS_S-UMY\" ] },\n    { \"wall\": \"back\", \"level\": \"wall\", \"items\": [ { \"code\": \"1KS_H-2DV\", \"width\": 800 } ] }\n  ],\n  \"appliances\": [\n    { \"code\": \"DBB5660HM\", \"wall\": \"back\", \"at\": 2001 },\n    { \"code\": \"Okno dvojkrídlové\", \"wall\": \"left\", \"at\": 1500, \"width\": 1000, \"height\": 1200, \"elevation\": 1000 }\n  ],\n  \"structures\": [\n    { \"kind\": \"Column\", \"wall\": \"front\", \"at\": 3300, \"width\": 300, \"depth\": 300, \"height\": 2650 }\n  ],\n  \"style\": { \"door_material\": \"AU01- Akrylové dvierka\", \"handlesdoor\": \"Bez úchýtky\" }\n}\n```\n\n| Kľúč | Význam |\n|---|---|\n| `room` | rozmery miestnosti, **povinné** `width` a `depth` (bez nich sa nič nepostaví) |\n| `clear` | predvolene `true` = plán sa pred stavbou vymaže; `false` = pridať k existujúcemu plánu |\n| `decor` | farba stien (`pb.decors('wall')`) a podlaha (`pb.decors('floor')`), voliteľné |\n| `corners` | rohové skrinky. `corner`: `back-left`, `back-right`, `front-right`, `front-left` |\n| `runs` | rady skriniek vedľa seba na jednej stene |\n| `runs[].level` | `base` (spodné + vysoké) alebo `wall` (horné). Ak chýba, určí sa podľa prvej skrinky |\n| `runs[].start` / `end` | začiatok alebo koniec radu v mm. Ak chýbajú, rad začne hneď za rohovou skrinkou |\n| `runs[].anchor` | `\"end\"` = rad končí pri konci steny (alebo pred rohovou skrinkou na konci) |\n| `runs[].items[]` | kód skrinky, alebo objekt `{ code, width?, height?, depth?, elevation?, gap?, options?, attributes? }`. `gap` = medzera v mm **za** skrinkou (pred ďalšou) |\n| `appliances` | samostatné prvky: voľne stojace chladničky, digestory, okná, dvere, rozvody |\n| `structures` | `Column` (stĺp), `Wall` (priečka/výstupok), `Beam` (preklad), `Other` |\n| `style` | voľby pre všetky skrinky naraz (katalóg (časť C) → `style`) |\n| `items` | jednotlivé skrinky: ku stene `{ code, wall, at }` alebo **voľne** `{ code, x, z, rotation }`, napr. ostrovček, barový pult. `x`, `z` = stred skrinky v mm. `rotation` = smer čela: 0 dopredu, 90 doprava, 180 dozadu, 270 doľava |\n| `appliances` / `structures` | tiež môžu byť voľne (`x`, `z`, `rotation`). Napr. ostrovčekový digestor nad varnou doskou v ostrovčeku. Stavebný prvok môže mať `decor` (kód z `pb.decors('wall')`) |\n| `project` | projektové voľby pre celú kolekciu: `[[voľba, kolekcia, hodnota], …]`, napr. `[\"door_material\", \"standard_kitchen_cabinet\", \"AU01- Akrylové dvierka\"]`. Platia aj pre neskôr pridané skrinky |\n| `dimensions` | kóty v pôdoryse: `[{ start: [x,y,z], end: [x,y,z], offset }]` (zobrazia sa v režime kót a v tlači) |\n| `labels` | popisky: `[{ text, point: [x,y,z] }]` |\n| `lighting` | osvetlenie: `{ global: { intensity }, room: { intensity }, sun: { enabled, angle } }` |\n| `materials` | atribúty pre všetky skrinky naraz: `[[voľba, atribút, hodnota], …]`. Dekory, madlá, závesy, LED… (katalóg (časť C) → `attributes`). Nastavujú sa až po `style` |\n\n**Čo netreba zadávať, doplní sa samo:** pracovnú dosku, sokel, drez s batériou (pri drezovej skrinke)\na varnú dosku (pri `options: { \"cooktop\": \"on\" }`).\n\n## 3. Pravidlá rozvrhnutia\n\n1. **Súčet šírok** v rade nesmie presiahnuť dĺžku steny mínus rohy. Pri presahu vráti `pb.build`\n   varovanie a validácia hlási `outOfBounds` alebo `intersection`.\n2. **Rohy:**\n   - **L rohová** (`1KS_SR-LM`, 900 × 900) zaberie 900 mm na oboch stenách.\n   - **Priama rohová** (`1KS_SR-PR`, šírka 1 020) stojí na primárnej stene rohu a na kolmej stene zaberie 600 mm.\n     Primárne steny: back-left → `back`, back-right → `right`, front-right → `front`, front-left → `left`.\n     Inú stenu zvolíš kľúčom `wall`.\n   - **Horná priama rohová** (`1KS_H-PR-1DV`, šírka 600) stojí na primárnej stene, kolmý rad horných skriniek začne o 360 mm od rohu.\n   - **Horná L rohová** (`1KS_H-LM-2DV`) zaberie 600 × 600 na hornej úrovni. Daj jej `height` rovnakú ako ostatným horným skrinkám (predvolená je 500, bežné horné majú 600).\n   - Rady na oboch stenách rohu nechaj bez `start`. Začnú automaticky za rohom.\n3. **Výšky:**\n   - Spodné skrinky majú korpus 722 mm a nožičky +125, gripless 782 mm.\n   - Pracovná doska je vo výške ~885–900 mm.\n   - Horné skrinky majú predvolene spodnú hranu **1 400 mm** a výšku 600 mm (horná hrana 2 000).\n   - Vysoké skrinky majú korpus 2 000 + nožičky = 2 125 mm.\n   - Digestor: spodná hrana predvolene 1 550 mm.\n4. **Nad varnou doskou** nedávaj hornú skrinku. Patrí tam digestor (`appliances`, `at` = stred varnej\n   skrinky − polovica šírky digestora) alebo kryt digestora `1KS_H-KRYT-DIG`.\n5. **Pod oknom** nedávaj horné skrinky. Okno s parapetom 1 000–1 100 mm môže byť nad drezom.\n6. **Drez** býva pod oknom, **umývačka** hneď vedľa drezu, **varná doska** aspoň 300 mm od drezu\n   aj od vysokej skrinky, **chladnička** na konci radu.\n7. **Šírky** zaokrúhľuj na 50 mm a drž sa rozsahov z katalógu (`width [min,max]`).\n   Moduly s `null` rozsahom majú pevnú šírku. Doplnky na zarovnanie:\n   `1KS_S-vykryt` (50–200), `1KS_H-BOCNY-VYKRYT` (60–500), `1KS_V-vykryt`.\n8. **Línia:** v jednej kuchyni používaj jednu líniu: buď `standard`, alebo `gripless`\n   (kódy `…-GRIPLESS` / `…-GRIP`). Nemiešaj ich.\n9. **Dekory a kovanie** (`materials`) idú podľa voľby, ktorá ich sprístupňuje. Model madla existuje\n   len pri `handlesdoor: \"Štandardné úchytky\"`. Farba LED existuje len pri `led_bottom` ≠ „Vypnutý“.\n   Preto nastav najprv `style`, potom `materials`. Hodnotu zadávaj kódom alebo presným názvom.\n   Ak hodnotu nepoznáš, napíš do `_assumptions`, čo hľadáš, a človek ju doplní cez `pb.attributeValues`.\n   ```json\n   \"style\": { \"handlesdoor\": \"Štandardné úchytky\", \"led_bottom\": \"Do hrany dna\" },\n   \"materials\": [\n     [\"door_material\", \"dtdl\", \"H1180 ST37_G\"],\n     [\"main_materials\", \"Materiál korpusu\", \"K8685 BS_G\"],\n     [\"worktop\", \"w_material\", \"5527 FP_W\"],\n     [\"handlesdoor\", \"model\", \"Madlo F021 (320), inox\"],\n     [\"hinges\", \"choice\", \"BLUM Blumotion - uhol 155°\"],\n     [\"drawers\", \"color\", \"Antracit\"]\n   ]\n   ```\n10. **Model spotrebiča:**\n   - Varná doska: `\"attributes\": [[\"cooktop\", \"cooktop\", \"HK774400FB\"]]` (s `options: { cooktop: \"on\" }`).\n   - Rúra vo vysokej skrinke `1KS_V-590…`: `\"attributes\": [[\"Vstavaná rúra\", \"oven_590\", \"EOB5750AOX\"]]`.\n\n## 4. Postup (slučka AI ↔ Prodboard)\n\n```js\n// 1) načítať skript (raz po otvorení konštruktora): obsah prodboard-api.js do konzoly\n// 2) nový neuložený projekt\nawait pb.newProject()\n// 3) postaviť z JSON špecifikácie\nconst r = pb.build(spec)            // { items, warnings, errors, project }\n// 4) kontrola: r.warnings a r.errors musia byť prázdne; inak uprav spec a opakuj.\n//    Chyby vstupu (neznámy kód, stena, chýbajúce pole…) majú error: 'spec' a plán sa vtedy NEZMENÍ (r.changed === false).\n//    Chyba počas stavby (error: 'build') vráti plán do pôvodného stavu.\n// 5) vizuálna kontrola (obrázok pre AI)\npb.view('top');  const plan = await pb.screenshot({ width: 1200, height: 900 })\npb.view('3d');   const view = await pb.screenshot({ width: 1200, height: 900 })\n// 6) textový stav plánu (čo sa naozaj postavilo)\npb.describe()                       // { room, items[{code,wall,at,width,height,depth,bottom}], injected, errors, total }\n// 7) uložiť iba na pokyn človeka (založí projekt v CRM)\nawait pb.save('Kuchyňa Novák', { name: 'Ján Novák', email: '…' }, { confirm: true })\n```\n\n**Chyby z validácie:**\n- `intersection-error`: dva prvky sa prekrývajú (`first`, `second`). Posuň alebo zúž.\n- `outOfBounds-error`: prvok je mimo miestnosti. Skontroluj `at + width` a dĺžku steny.\n\n## 5. Príklady\n\n### Lineárna kuchyňa 3,6 m (overené: bez chýb)\n```json\n{\n  \"room\": { \"width\": 3600, \"depth\": 3000, \"height\": 2650 },\n  \"runs\": [\n    { \"wall\": \"back\", \"items\": [\n      { \"code\": \"1KS_S-5ZAS\", \"width\": 400 },\n      { \"code\": \"1KS_S-DREZ_2DV\", \"width\": 800 },\n      \"1KS_S-UMY\",\n      { \"code\": \"1KS_S-2DV\", \"width\": 800, \"options\": { \"cooktop\": \"on\" } },\n      { \"code\": \"1KS_S-1DV\", \"width\": 400 },\n      \"1KS_V-CH-1DV\"\n    ] },\n    { \"wall\": \"back\", \"level\": \"wall\", \"items\": [\n      { \"code\": \"1KS_H-1DV\", \"width\": 400 },\n      { \"code\": \"1KS_H-2DV\", \"width\": 800 },\n      { \"code\": \"1KS_H-1DV\", \"width\": 600 }\n    ] }\n  ],\n  \"appliances\": [ { \"code\": \"DBB5660HM\", \"wall\": \"back\", \"at\": 1901 } ]\n}\n```\nHorné skrinky končia na 1 800. Nad varnou doskou (1 800–2 600) je digestor a nad `1KS_S-1DV` (2 600–3 000) nič.\n\n### Kuchyňa do L s oknom nad drezom (overené: bez chýb)\n```json\n{\n  \"room\": { \"width\": 3200, \"depth\": 2800, \"height\": 2600 },\n  \"corners\": [ { \"corner\": \"back-left\", \"code\": \"1KS_SR-LM-GRIPLESS\" } ],\n  \"runs\": [\n    { \"wall\": \"back\", \"items\": [\n      { \"code\": \"1KS_S-DREZ_2DV-GRIPLESS\", \"width\": 800 }, \"1KS_S-UMY-GRIPLESS\",\n      { \"code\": \"1KS_S-3ZAS-GRIPLESS\", \"width\": 600 },\n      { \"code\": \"1KS_S-1ZAS-GRIPLESS\", \"width\": 300, \"options\": { \"right_end\": \"Áno\" } } ] },\n    { \"wall\": \"left\", \"items\": [\n      { \"code\": \"1KS_S-2DV-GRIPLESS\", \"width\": 800, \"options\": { \"cooktop\": \"on\" },\n        \"attributes\": [[\"cooktop\", \"cooktop\", \"HK774400FB\"]] },\n      \"1KS_V-CH-1DV-GRIPLESS\" ] },\n    { \"wall\": \"back\", \"level\": \"wall\", \"start\": 2300, \"items\": [\n      { \"code\": \"1KS_H-1DV-GRIP\", \"width\": 450 }, { \"code\": \"1KS_H-1DV-GRIP\", \"width\": 450 } ] },\n    { \"wall\": \"left\", \"level\": \"wall\", \"start\": 0, \"items\": [\n      { \"code\": \"1KS_H-1DV-GRIP\", \"width\": 600 }, { \"code\": \"1KS_H-1DV-GRIP\", \"width\": 300 } ] }\n  ],\n  \"appliances\": [\n    { \"code\": \"Okno dvojkrídlové\", \"wall\": \"back\", \"at\": 1000, \"width\": 1000, \"height\": 1200, \"elevation\": 1100 },\n    { \"code\": \"DBB5660HM\", \"wall\": \"left\", \"at\": 1001 },\n    { \"code\": \"Loft Right\", \"wall\": \"front\", \"at\": 2200 },\n    { \"code\": \"Dvojzásuvka\", \"wall\": \"back\", \"at\": 2450, \"elevation\": 1050 }\n  ],\n  \"structures\": [ { \"kind\": \"Beam\", \"wall\": \"back\", \"at\": 0, \"width\": 3200, \"height\": 200, \"depth\": 300, \"elevation\": 2400 } ],\n  \"style\": { \"door_material\": \"AU01- Akrylové dvierka\" }\n}\n```\n\n### Kuchyňa do U s oboma typmi rohov (overené: bez chýb)\n```json\n{\n  \"room\": { \"width\": 4000, \"depth\": 3200, \"height\": 2650 },\n  \"corners\": [\n    { \"corner\": \"back-left\", \"code\": \"1KS_SR-LM\" },\n    { \"corner\": \"back-right\", \"code\": \"1KS_SR-PR\" },\n    { \"corner\": \"back-left\", \"code\": \"1KS_H-LM-2DV\", \"height\": 600 }\n  ],\n  \"runs\": [\n    { \"wall\": \"back\", \"items\": [ { \"code\": \"1KS_S-5ZAS\", \"width\": 400 }, { \"code\": \"1KS_S-DREZ_2DV\", \"width\": 800 },\n      \"1KS_S-UMY\", { \"code\": \"1KS_S-2DV\", \"width\": 700, \"options\": { \"cooktop\": \"on\" } } ] },\n    { \"wall\": \"left\", \"items\": [ { \"code\": \"1KS_S-1DV\", \"width\": 500 }, { \"code\": \"1KS_S-3ZAS\", \"width\": 600 } ] },\n    { \"wall\": \"right\", \"items\": [ \"1KS_V-590\", \"1KS_V_P-2DV\" ] },\n    { \"wall\": \"back\", \"level\": \"wall\", \"items\": [ { \"code\": \"1KS_H-2DV\", \"width\": 800 }, { \"code\": \"1KS_H-1DV\", \"width\": 600 },\n      { \"code\": \"1KS_H-2DV\", \"width\": 700 } ] },\n    { \"wall\": \"left\", \"level\": \"wall\", \"items\": [ { \"code\": \"1KS_H-1DV\", \"width\": 500 } ] }\n  ],\n  \"appliances\": [\n    { \"code\": \"DBB5660HM\", \"wall\": \"back\", \"at\": 2751 },\n    { \"code\": \"Okno dvojkrídlové\", \"wall\": \"left\", \"at\": 1500, \"width\": 1000, \"height\": 1200, \"elevation\": 1000 },\n    { \"code\": \"Otvor\", \"wall\": \"front\", \"at\": 400, \"width\": 900, \"height\": 2100 }\n  ],\n  \"structures\": [ { \"kind\": \"Column\", \"wall\": \"front\", \"at\": 3700, \"width\": 300, \"depth\": 300, \"height\": 2650 } ]\n}\n```\n\n### Kuchyňa s ostrovčekom (overené: bez chýb)\nOstrovček sú dva rady skriniek chrbtom k sebe. Predný rad má čelo dopredu (`rotation: 0`),\nzadný rad dozadu ku kuchynskej linke (`rotation: 180`). Stred zadného radu je o hĺbku skrinky (600) bližšie k zadnej stene.\n```json\n{\n  \"room\": { \"width\": 4500, \"depth\": 4000, \"height\": 2650 },\n  \"runs\": [ { \"wall\": \"back\", \"items\": [ { \"code\": \"1KS_S-3ZAS\", \"width\": 600 }, { \"code\": \"1KS_S-DREZ_2DV\", \"width\": 800 },\n    \"1KS_S-UMY\", { \"code\": \"1KS_S-2DV\", \"width\": 900 }, \"1KS_V_P-2DV\", \"1KS_V-590\" ] } ],\n  \"items\": [\n    { \"code\": \"1KS_S-2DV\",  \"x\": 1650, \"z\": 2300, \"rotation\": 0, \"width\": 600, \"options\": { \"cooktop\": \"on\" } },\n    { \"code\": \"1KS_S-3ZAS\", \"x\": 2250, \"z\": 2300, \"rotation\": 0, \"width\": 600 },\n    { \"code\": \"1KS_S-3ZAS\", \"x\": 2850, \"z\": 2300, \"rotation\": 0, \"width\": 600 },\n    { \"code\": \"1KS_S-OTP\",  \"x\": 1650, \"z\": 1700, \"rotation\": 180, \"width\": 600 },\n    { \"code\": \"1KS_S-OTP\",  \"x\": 2250, \"z\": 1700, \"rotation\": 180, \"width\": 600 },\n    { \"code\": \"1KS_S-OTP\",  \"x\": 2850, \"z\": 1700, \"rotation\": 180, \"width\": 600 }\n  ],\n  \"appliances\": [ { \"code\": \"DIE5960HG\", \"x\": 1650, \"z\": 2300, \"rotation\": 0, \"elevation\": 1600 } ],\n  \"structures\": [ { \"kind\": \"Column\", \"wall\": \"front\", \"at\": 4200, \"width\": 300, \"depth\": 300, \"height\": 2650, \"decor\": \"Dix Blue\" } ],\n  \"project\": [ [\"door_material\", \"standard_kitchen_cabinet\", \"AU01- Akrylové dvierka\"] ],\n  \"style\": { \"handlesdoor\": \"Štandardné úchytky\" },\n  \"materials\": [ [\"handlesdoor\", \"model\", \"Madlo F021 (320), inox\"], [\"worktop\", \"w_material\", \"5527 FP_W\"] ],\n  \"dimensions\": [ { \"start\": [0, 900, 0], \"end\": [4500, 900, 0], \"offset\": -200 } ],\n  \"labels\": [ { \"text\": \"Ostrovček\", \"point\": [2250, 900, 2000] } ],\n  \"lighting\": { \"global\": { \"intensity\": 0.9 } }\n}\n```\n\n## 6. Prompt pre AI (šablóna)\n\n> Si návrhár kuchýň. Z popisu alebo obrázka vytvor JSON špecifikáciu pre `pb.build()`.\n> Dodržuj súradnice, formát a pravidlá z AI-NAVOD.md. Kódy skriniek, spotrebičov a volieb ber\n> výhradne z katalóg (časť C). Rozmery v mm. Ak niečo z podkladu nevieš určiť, zvoľ bežnú hodnotu\n> (miestnosť 2 650 vysoká, horné skrinky 600 vysoké od 1 400 mm) a uveď to v poli `\"_assumptions\"`.\n> Skontroluj súčty šírok na každej stene. Vráť iba JSON.\n\nPole `_assumptions` (a akékoľvek kľúče začínajúce `_`) `pb.build` ignoruje. Iné neznáme kľúče\n(napr. preklep `corner` namiesto `corners`) tiež ignoruje, ale nahlási ich vo `warnings`.\n\n---\n\n# Časť C — Katalóg PALUAN (kódy skriniek, spotrebičov, volieb a atribútov)\n\n@@ZOSTAVENE@@. Stĺpce `modules` sú opísané v `modules_columns`.\n\n```json\n@@KATALOG@@\n```\n\n---\n\n> **PRE AI — PRIPOMIENKA:** Tým súbor končí. Nezhŕňaj ho a nepýtaj sa, čo s ním. Ak používateľ poslal\n> podklady, hneď vráť návrh: najviac 3 vety, súbor `kuchyna.json` a blok ```json. Ak poslal len tento\n> súbor, krátko napíš, že si pripravený, a vypýtaj si podklady (rozmery, okná, dvere, voda, tvar, spotrebiče, farby).\n"
const KATALOG_ZAKLAD = {"_info":"Katalóg PALUAN (Prodboard) pre generovanie kuchýň cez pb.build(). Vytiahnuté 2026-11-19. Rozmery v mm.","modules_columns":["code","name","kind (base=spodná, wall=horná, tall=vysoká)","line (standard=s úchytkou, gripless=bezúchytková)","shape (null=bežná, corner=L rohová, cornerLine=priama rohová, end=ukončovacia)","width default","width [min,max] alebo null=pevná","height default (korpus, bez nožičiek)","height [min,max]","depth default"],"modules":[["1KS_S-1DV","Spodná skrinka jednodvierková","base","standard",null,600,[150,800],722,[200,2200],600],["1KS_S-2DV","Spodná skrinka 2× dvierka","base","standard",null,600,[500,1400],722,[200,1500],600],["1KS_S-1ZAS","Spodná skrinka 1× zásuvka","base","standard",null,600,[150,1200],722,[100,1500],600],["1KS_S-2ZAS","Spodná skrinka 2× zásuvka","base","standard",null,600,[150,1200],722,[200,1500],600],["1KS_S-3ZAS","Spodná skrinka 3× zásuvka","base","standard",null,600,[150,1200],722,[362,1500],600],["1KS_S-4ZAS","Spodná skrinka 4× zásuvka","base","standard",null,600,[150,1600],722,[362,1500],600],["1KS_S-5ZAS","Spodná skrinka 5× zásuvka","base","standard",null,600,[150,1600],722,[362,1500],600],["1KS_S-1ZAS+1DV","Spodná 1× zásuvka + 1× dvierka","base","standard",null,600,[150,800],722,[362,1500],600],["1KS_S_1ZAS+2DV","Spodná 1× zásuvka + 2× dvierka","base","standard",null,600,[150,1200],722,[362,1500],600],["1KS_S_2ZAS+2DV","Spodná 2× zásuvka + 2× dvierka","base","standard",null,600,[150,1200],722,[362,1500],600],["1KS_S-CARGO","Spodná výsuvná CARGO","base","standard",null,150,[150,600],722,[622,1500],600],["1KS_S-SPACETWIN","Spodná SPACE TWIN","base","standard",null,200,[150,1200],722,[622,902],600],["1KS_S-OTS","Spodná otvorená, chrbát sololit","base","standard",null,600,[150,1800],722,[200,2200],600],["1KS_S-OTP","Spodná otvorená, pevný chrbát","base","standard",null,600,[150,1800],722,[200,2200],600],["1KS_S-DREZ_1DV","Drezová 1× dvierka","base","standard",null,600,[150,800],722,[362,2200],600],["1KS_S-DREZ_2DV","Drezová 2× dvierka","base","standard",null,600,[400,1300],722,[362,1500],600],["1KS_S-DREZ_1ZAS","Drezová 1× zásuvka","base","standard",null,600,[500,1200],722,[150,1500],600],["1KS_S_DREZ_1KOS","Drezová 1× kôš (šírka 600/800)","base","standard",null,600,null,722,[722,1000],600],["1KS_S_DREZ_DVIERKA","Drezová len dvierka (šírka 600/800)","base","standard",null,600,null,722,[722,1000],600],["1KS_S-UMY","Vstavaná umývačka (šírka 450/600)","base","standard",null,600,null,722,[722,1000],600],["1KS_S-UMY-PANEL","Umývačka s panelom (450/600)","base","standard",null,600,null,722,[722,1000],600],["1KS_S-RURA","Spodná rúra so zásuvkou","base","standard",null,600,null,722,[722,1500],600],["1KS_S-RURA450","Spodná kompaktná rúra so zásuvkou","base","standard",null,600,null,722,[722,1500],600],["1KS_POV-ZAS-RURA","Polovysoká rúra so zásuvkou","base","standard",null,600,null,1300,[722,1500],600],["1KS_S-CHLAD","Spodná vstavaná chladnička","base","standard",null,600,null,722,[722,822],600],["1KS_S-PRACKA","Spodná pre práčku","base","standard",null,650,[500,650],722,[600,1000],600],["1KS_SR-LM","Rohová lámacia L (zaberá 900×900)","base","standard","corner",900,[800,1400],722,[622,1500],900],["1KS_SR-PR","Rohová priama (slepá časť za kolmým radom)","base","standard","cornerLine",1020,[920,1420],722,[622,1500],600],["1KS_SR-PR-DREZ","Rohová priama drezová","base","standard","cornerLine",1020,[800,1420],722,[622,1500],600],["1KS_SR-PR-KOS","Rohová priama s ergonomickým košom","base","standard","cornerLine",1080,[1030,1420],722,[622,1500],600],["1KS_SR-VYKRYT","Spodný rohový výkryt","base","standard",null,600,[300,900],722,[622,1500],600],["1KS_S-vykryt","Záslepka medzi stenu a spodnú skrinku","base","standard",null,60,[50,200],722,[362,1000],600],["1KS_S-OBL-18","Obkladová doska spodná 18 mm (bočný panel)","base","standard",null,18,null,847,[200,2000],600],["1KS_S-OBL-36","Obkladová doska spodná 36 mm","base","standard",null,36,null,847,[200,2000],600],["1KS_S-OBL-DVIERKA","Obkladová doska spodná dvierkovina","base","standard",null,19,null,847,[200,2000],600],["1KS_H-1DV","Horná jednodvierková","wall","standard",null,600,[200,800],600,[200,2700],360],["1KS_H-1DV+ARET","Horná jednodvierková s aretáciou police","wall","standard",null,600,[200,800],600,[200,2700],360],["1KS_H-2DV","Horná dvojdvierková","wall","standard",null,600,[400,1400],600,[200,2100],360],["1KS_H-1MIN","Horná sklopná","wall","standard",null,600,[200,1500],300,[200,480],360],["1KS_H-1HK","Horná výklop HK","wall","standard",null,600,[500,1450],500,[205,600],360],["1KS_H-1HKS","Horná výklop HKS","wall","standard",null,600,[500,1000],360,[200,360],360],["1KS_H-1HK-XS","Horná výklop HK-XS","wall","standard",null,600,[500,1000],360,[240,360],360],["1KS_H-1HL","Horná výklop HL","wall","standard",null,600,[500,1200],500,[300,580],360],["1KS_H-1HL+ARET","Horná výklop HL s aretáciou police","wall","standard",null,600,[500,1200],500,[300,580],360],["1KS_H-1HF","Horná výklop HF","wall","standard",null,600,[500,1200],500,[500,900],360],["1KS_H-1ZAS","Horná so zásuvkou","wall","standard",null,600,[300,1210],300,[120,600],500],["1KS_H-OTS","Horná otvorená, sololit","wall","standard",null,600,[200,1200],600,[200,2000],360],["1KS_H-OTP","Horná otvorená, pevný chrbát","wall","standard",null,600,[200,2500],600,[200,2650],360],["1KS_H-OT+ARET","Horná otvorená s aretáciou police","wall","standard",null,600,[200,800],600,[200,2700],360],["1KS_H-UKON-OT","Horná ukončovacia otvorená","wall","standard","end",600,[200,900],600,[200,2650],360],["1KS_H-LM-2DV","Horná rohová lámacia L (zaberá 600×600)","wall","standard","corner",600,[400,1200],500,[300,2000],600],["1KS_H-LM-OT","Horná rohová otvorená L","wall","standard","corner",600,[400,1300],500,[200,2200],600],["1KS_H-PR-1DV","Horná rohová priama jednodvierková","wall","standard","cornerLine",600,[600,1400],500,[315,2000],360],["1KS_SZ-1DV","Spodná závesná jednodvierková","wall","standard",null,600,[200,800],600,[200,2700],360],["1KS_H-BOCNY-VYKRYT","Záslepka medzi stenu a hornú skrinku","wall","standard",null,60,[60,500],600,[200,1550],360],["1KS_H-ZASLEP","Vrchný záslep medzi skrinku a strop","wall","standard",null,600,[100,2780],100,[50,600],118],["1KS_H-KRYT-DIG","Kryt digestora","wall","standard",null,500,[200,1200],200,[100,400],340],["1KS_H-KRYT-KOM","Kryt rúry","wall","standard",null,200,[100,1000],400,[100,1500],340],["1KS_H-POLICA-36","Polica 36 mm s podperkami","wall","standard",null,800,[450,2780],36,null,360],["1KS_H-zastena-krono","Zástena 10 mm KRONOSPAN","wall","standard",null,600,[40,4100],600,[40,640],10],["1KS_H-zastena-egger","Zástena 8 mm EGGER","wall","standard",null,600,[40,4100],600,[40,640],8],["1KS_H-OBL-18","Obkladová doska horná 18 mm","wall","standard",null,18,null,600,[100,2780],382],["1KS_V_P-2DV","Vysoká potravinová","tall","standard",null,600,[200,800],2000,[1000,2600],600],["1KS_V_P-DV","Vysoká potravinová, celé dvierka","tall","standard",null,600,[150,1200],2000,[1000,2600],600],["1KS_V_P-DV-ZAS","Vysoká potravinová so zásuvkami","tall","standard",null,600,[300,800],2000,[1000,2600],600],["1KS_V_P-1x2DV","Vysoká potravinová 2× celé dvierka","tall","standard",null,900,[500,1200],2000,[1000,2600],600],["1KS_V_P-2x2DV","Vysoká potravinová 2×2 dvierka","tall","standard",null,900,[600,1200],2000,[1000,2600],600],["1KS_V-590","Vysoká spotrebičová: rúra","tall","standard",null,600,null,2000,[1500,2600],600],["1KS_V-380","Vysoká spotrebičová: mikrovlnka","tall","standard",null,600,null,2000,[1500,2600],600],["1KS_V-590+380","Vysoká spotrebičová: rúra + mikrovlnka","tall","standard",null,600,null,2000,[1500,2600],600],["1KS_V-ZAS-590-DV","Vysoká spotrebičová: zásuvka + rúra","tall","standard",null,600,null,2000,[1500,2600],600],["1KS_V-1ZAS-590-380-DV","Vysoká spotrebičová: 1 zás. + rúra + mikro","tall","standard",null,600,null,2000,[1500,2600],600],["1KS_V-2ZAS-590-380-DV","Vysoká spotrebičová: 2 zás. + rúra + mikro","tall","standard",null,600,null,2000,[1500,2600],600],["1KS_V-3ZAS-590-380-DV","Vysoká spotrebičová: 3 zás. + rúra + mikro","tall","standard",null,600,null,2000,[2000,2600],600],["1KS_V-CH-1DV","Vysoká chladničková (vstavaná chladnička)","tall","standard",null,600,[600,750],2000,[1250,2600],600],["1KS_V-CH-zvys-dno","Vysoká chladničková so zvýšeným dnom","tall","standard",null,600,[600,750],2000,[1850,2600],600],["1KS_V_OTV","Vysoká otvorená","tall","standard",null,600,[150,1200],2000,[1000,2600],600],["1KS_V-DV-SPAJZA","Dvere do špajze","tall","standard",null,600,[500,800],2000,[1900,2200],760],["1KS_V-vykryt","Výkryt vysokej skrine","tall","standard",null,100,[51,500],2000,[300,2750],600],["1KS_V-OBL-18","Obkladová doska vysoká 18 mm","tall","standard",null,18,null,2100,[100,2780],582],["1KS_S-1DV-GRIPLESS","Spodná jednodvierková","base","gripless",null,600,[150,800],782,[200,2200],600],["1KS_S-2DV-GRIPLESS","Spodná 2× dvierka","base","gripless",null,600,[500,1400],782,[200,1500],600],["1KS_S-1ZAS-GRIPLESS","Spodná 1× zásuvka","base","gripless",null,600,[150,1200],782,[150,1500],600],["1KS_S-2ZAS-GRIPLESS","Spodná 2× zásuvka","base","gripless",null,600,[150,1200],782,[200,1500],600],["1KS_S-3ZAS-GRIPLESS","Spodná 3× zásuvka","base","gripless",null,600,[150,1200],782,[362,1500],600],["1KS_S-1ZAS+1DV-GRIPLESS","Spodná 1× zásuvka + 1× dvierka","base","gripless",null,600,[150,800],782,[362,1500],600],["1KS_S_1ZAS+2DV-GRIPLESS","Spodná 1× zásuvka + 2× dvierka","base","gripless",null,600,[150,1200],782,[362,1500],600],["1KS_S-CARGO-GRIPLESS","Spodná CARGO","base","gripless",null,150,[150,600],782,[622,1500],600],["1KS_S-SPACETWIN-GRIPLESS","Spodná SPACE TWIN","base","gripless",null,200,[150,1200],782,[722,902],600],["1KS_S-DREZ_1DV-GRIPLESS","Drezová 1× dvierka","base","gripless",null,600,[150,800],782,[362,2200],600],["1KS_S-DREZ_2DV-GRIPLESS","Drezová 2× dvierka","base","gripless",null,600,[400,1300],782,[362,1500],600],["1KS_S-DREZ-1ZAS-GRIPLESS","Drezová 1× zásuvka","base","gripless",null,600,[150,1200],782,[150,1500],600],["1KS_S-DREZ-KOS-GRIPLESS","Drezová 1× kôš","base","gripless",null,600,null,782,[622,1500],600],["1KS_S-DREZ-DVIERKA-GRIPLESS","Drezová len dvierka","base","gripless",null,600,[150,1200],782,[150,1500],600],["1KS_S-UMY-GRIPLESS","Vstavaná umývačka","base","gripless",null,600,null,782,[755,1000],600],["1KS_S-RURA-GRIPLESS","Spodná rúra so zásuvkou","base","gripless",null,600,null,782,[757,1500],600],["1KS_SR-LM-GRIPLESS","Rohová lámacia L","base","gripless","corner",900,[800,1400],782,[622,1500],900],["1KS_SR-PR-GRIPLESS","Rohová priama","base","gripless","cornerLine",1020,[920,1420],782,[622,1500],600],["1KS_SR-PR-DREZ-GRIPLESS","Rohová priama drezová","base","gripless","cornerLine",1020,[800,1420],782,[622,1500],600],["1KS_SR-PR-GRIPLESS-KOS","Rohová priama s košom","base","gripless","cornerLine",1080,[1030,1420],782,[622,1500],600],["1KS_H-1DV-GRIP","Horná jednodvierková","wall","gripless",null,600,[200,800],600,[200,2700],360],["1KS_H-1DV-GRIP+ARET","Horná jednodvierková s aretáciou","wall","gripless",null,600,[200,800],600,[200,2700],360],["1KS_V_P-2DV-GRIPLESS","Vysoká potravinová","tall","gripless",null,600,[200,800],2000,[1000,2600],600],["1KS_V_P-DV-GRIPLESS","Vysoká potravinová, celé dvierka","tall","gripless",null,600,[200,1200],2000,[1000,2600],600],["1KS_V_P-DV-ZAS-GRIPLESS","Vysoká potravinová so zásuvkami","tall","gripless",null,600,[300,800],2000,[1000,2600],600],["1KS_V-590-GRIPLESS","Vysoká spotrebičová: rúra","tall","gripless",null,600,null,2000,[1500,2600],600],["1KS_V-380-GRIPLESS","Vysoká spotrebičová: mikrovlnka","tall","gripless",null,600,null,2000,[1500,2600],600],["1KS_V-590+380-GRIPLESS","Vysoká spotrebičová: rúra + mikro","tall","gripless",null,600,null,2000,[1500,2600],600],["1KS_V-ZAS-590-DV-GRIPLESS","Vysoká spotrebičová: zásuvka + rúra","tall","gripless",null,600,null,2000,[2000,2600],600],["1KS_V-1ZAS-590-380-DV-GRIPLESS","Vysoká spotrebičová: 1 zás. + rúra + mikro","tall","gripless",null,600,null,2000,[1900,2600],600],["1KS_V-2ZAS-590-380-DV-GRIPLESS","Vysoká spotrebičová: 2 zás. + rúra + mikro","tall","gripless",null,600,null,2000,[1900,2600],600],["1KS_V-3ZAS-590-380-DV-GRIPLESS","Vysoká spotrebičová: 3 zás. + rúra + mikro","tall","gripless",null,600,null,2000,[2000,2600],600],["1KS_V-CH-1DV-GRIPLESS","Vysoká chladničková","tall","gripless",null,600,[600,750],2000,[1250,2600],600],["1KS_V-CH-zvys-dno-GRIPLESS","Vysoká chladničková so zvýšeným dnom","tall","gripless",null,600,[600,750],2000,[1850,2600],600]],"appliances_columns":["code","popis","typ","[šírka, výška, hĺbka]"],"appliances":{"fridge (voľne stojace chladničky → pb.appliance)":[["Liebherr_CES_4023","Liebherr kombinovaná","fridge",[600,2010,657]],["BOSCH KGV 39VW31","Bosch kombinovaná","fridge",[600,2010,651]],["Samsung RL-34 ECSW1_BWT","Samsung kombinovaná","fridge",[600,2000,589]],["SMEG FA 860PS","Smeg retro","fridge",[596,1800,638]],["LIEBHERR SBSesf 7212","Liebherr Side-by-Side","fridge",[1200,1835,656]]],"kitchenHood (digestory → pb.appliance, predvolene 1550 mm nad podlahou)":[["DBB5660HM","AEG komínový 60 cm","kitchenHood",[598,645,500]],["DBB5960HM","AEG komínový 90 cm","kitchenHood",[898,645,500]],["DIE5960HG","AEG komínový 90 cm (hĺbka 609)","kitchenHood",[898,623,609]],["EFV60657OK","Electrolux komínový 60 cm","kitchenHood",[598,877,337]],["EFB90460OX","Electrolux komínový 90 cm","kitchenHood",[898,1090,501]],["FABER_EV8XA37","Faber Cylinder","kitchenHood",[370,772,370]]],"washer (práčky)":[["WHIRLPOOL AWOE 10914","Whirlpool","washer",[600,849,622]],["SMEG SLB 147X","Smeg","washer",[600,850,589]]],"cooktop (varné dosky → atribút skrinky: attributes [['cooktop','cooktop', KÓD]] pri options {cooktop:'on'})":[["HK634021XB","AEG sklokeramická 60 cm (predvolená)"],["HK654070XB","AEG sklokeramická 60 cm"],["HK854080FB","AEG sklokeramická 80 cm"],["HK774400FB","AEG indukčná Pure 68 cm"],["HK874400FB","AEG indukčná Pure 80 cm"],["HKH81700FB","AEG indukčná MaxiSense Combi 80 cm"],["IDK84451IB","AEG indukčná Bridge 80 cm"],["EHI6340FOK","Electrolux indukčná Bridge 60 cm"],["EHD8740FOK","Electrolux indukčná Pure 80 cm"],["EHF6343FOK","Electrolux sklokeramická 60 cm"],["HG654550SM","AEG plynová 60 cm"],["EGS6648NOX","Electrolux plynová 60 cm"],["EGD6576NOK","Electrolux kombinovaná 60 cm"]],"oven (vstavané rúry → atribút vysokej skrinky 1KS_V-590…: attributes [['Vstavaná rúra','oven_590', KÓD]])":[["BEB351110M3D","AEG s parou (predvolená)"],["BEB351110M","AEG s parnou funkciou"],["EOB5750AOX","Electrolux"],["EOC5751FAX","Electrolux"],["EOA5851FAX","Electrolux Assisted Cooking"],["EZB3400AOX","Electrolux"]],"builtinMicrowave (mikrovlnky 380 → atribút vysokej skrinky 1KS_V-380 / 590+380)":[["EMT25207OX","Electrolux nerez"],["EMT25207OB","Electrolux čierna"],["MSB2547D-M","AEG"]],"window (okná → pb.appliance; width/height nastaviteľné, elevation = parapet, predvolene 900)":[["Okno dvojkrídlové","šírka 400–2200, výška 400–2000","window"],["Okno pevné","šírka 600–4000, výška 300–2000","window"],["Okno  terasové dvojkrídlové","terasové, šírka 400–3000, výška 1800–3000, elevation 0 (pozor: v kóde sú dve medzery)","window"],["Okno terasové trojkrídlové","šírka 1500–4000","window"],["Okno terasové štvorkrídlové","šírka 3000–5000","window"]],"door (dvere a otvory → pb.appliance, elevation 0)":[["Otvor","stavebný otvor, šírka 600–5000, výška 1000–3500","door"],["Oblúkový otvor","oblúkový otvor","door"],["Loft Left","dvere Loft, ľavé (šírka 700–1200)","door"],["Loft Right","dvere Loft, pravé (šírka 700–1200)","door"],["Modern Left","dvere Modern, ľavé; ďalšie: Citadel, Style, Lisma, Dublin, Neo, Twins, Berlin… (každé ako '<názov> Left' a '<názov> Right')","door"]],"roomElement (rozvody → pb.appliance s elevation)":[["Dvojzásuvka","elektrická zásuvka 2×","roomElement",[157,101,23]],["Jednozásuvka","elektrická zásuvka","roomElement",[100,101,23]],["Vypínač","vypínač","roomElement",[100,101,19]],["Výstup vody","prípojka vody","roomElement",[160,52,94]],["Odtok 1","odpad","roomElement",[63,63,68]],["Plynový kotol","plynový kotol","roomElement",[350,607,153]],["Plynomer","plynomer","roomElement",[185,238,151]],["Vertikálne potrubie","stúpačka","roomElement",[30,1736,30]],["Ventilačná mriežka 1","vetranie","roomElement",[175,175,8]]]},"structures":{"Column":"stĺp / pilier (width × depth pôdorys, height)","Wall":"stena / priečka / výstupok steny","Beam":"preklad / trám pod stropom (elevation = spodná hrana)","Other":"iný stavebný prvok"},"style_info":"Voľby pre všetky skrinky naraz (pb.build → style, alebo pb.optionAll). Hodnota sa zadáva presným názvom.","style":{"door_material":["DTDL01 - Drevotrieskové dvierka","AU01- Akrylové dvierka","Hliníkový rám - profil Z1","P101 - Striekané dvierka","P201 - Striekané dvierka","P202 - Striekané dvierka","P204 - Striekané dvierka","P205 - Striekané dvierka","P206 - Striekané dvierka","P403H - Striekané dvierka","C01 - Fóliované dvierka","M14 - Fóliované dvierka","M15 - Fóliované dvierka","R20 - Fóliované dvierka","R22 - Fóliované dvierka","R27 - Fóliované dvierka","R29 - Fóliované dvierka","R33 - Fóliované dvierka","G42 - Fóliované dvierka","G43 - Fóliované dvierka","G46 - Fóliované dvierka"],"handlesdoor":["Štandardné úchytky","Bez úchýtky","Úchytky na hranu","UKW profil spodný","UKW profil horný"],"worktop":["Laminátová 38mm","Laminátová 20mm","Kompaktná pracovná doska","Off"],"type_wk_connection":["Hliníková lišta","Zámkový spoj"],"hinges":["BLUM Blumotion","BLUM TIP-ON","DTC Swell"],"drawers":["EVObox Evolution","Tandembox Blumotion","Tandembox TIP-ON","Legrabox","Legrabox TIP-ON","CreoBox","BLUM skrytý plnovýsuv","BLUM skrytý plnovýsuv TIPON"],"sokel":["DTDL sokel","OFF"],"led_bottom":["Vypnutý","Do hrany dna","Do plochy","Do hrany dna Hafäle"],"Table_socket":["Off","Výklopná zásuvka","Elevator socket"],"grille":["Off","Plastová mriežka","Hliníková mriežka 60mm","Hliníková mriežka 80mm"],"base_content":["Off","Police"],"upper_content":["Off","Police"],"cutlery_tray":["OFF","Príborník COMFORT"]},"attributes_info":"Atribúty volieb (dekory, madlá, kovanie, LED…) pre pb.build → materials: [[voľba, atribút, hodnota]] alebo pb.attributeAll / pb.attribute. Kompletný zoznam hodnôt: pb.attributeValues(uuid, voľba, atribút, filter). Atribút s opakovaným kódom (ch) treba zadať názvom.","attributes":{"door_material / dtdl":"dekor DTDL dvierok, 543 dekorov (EGGER, KRONOSPAN…), napr. K8685 BS_G (biela Snow White), H1180 ST37_G (Dub Halifax prírodný), H1142 ST36_G (Dub Sacramento hnedý), 15177/0011 (Dub radiálny), 0244 SU_G (Petrol)","door_material / primary_akryl":"dekor akrylových dvierok (pri door_material = AU01- Akrylové dvierka) — presný zoznam vo values","door_material / primary_spray":"farba striekaných dvierok (pri door_material = P…) — presný zoznam vo values","door_material / alt":"zadná strana dvierok","door_material / choice":"orientácia textúry dvierok (enum)","main_materials / Materiál korpusu":"dekor korpusu (napr. K8685 BS_G biela)","main_materials / Materiál chrbta skrinky":"chrbát skrinky (napr. K8685 BS_10_G)","worktop / w_material":"dekor pracovnej dosky — presný zoznam vo values (kódy končia _W)","sokel / ch":"materiál sokla","handlesdoor / model":"model madla, 253 modelov, napr. 779857 = Madlo F021 (128) inox … 779861 = (320); zadávať aj názvom 'Madlo F021 (320), inox' (iba pri handlesdoor = Štandardné úchytky)","hinges / choice":"typ závesu: BLUM Blumotion - uhol 110° / uhol 155° / Hliníkový rám - uhol 95° (rohové skrinky majú iné typy)","drawers / color":"farba zásuviek: Biela / Antracit / Sivá","drawers / drawer1..3":"materiál zásuviek","bottom_overlap / offset":"presah dvierok nadol v mm (iba pri bottom_overlap = Presah); top_overlap a side_overlap sú voľby s rovnakým princípom (atribúty over cez pb.attributes)","led_bottom / color":"farba LED profilu (iba pri led_bottom ≠ Vypnutý); ďalej led_bottom / model, switch (vypínač), trafo (zdroj), drilling","abs_taping / carcas_taping":"páskovanie hrán korpusu (enum)","cooktop / cooktop":"model varnej dosky (pozri appliances.cooktop)","cooktop / cooktop_correction":"posun varnej dosky vľavo/vpravo v mm","Vstavaná rúra / oven_590":"model rúry vo vysokej spotrebičovej skrinke"},"per_cabinet_options":{"cooktop":"na spodnej skrinke: options { cooktop: 'on' } → varná doska nad skrinkou","hood":"na hornej skrinke: options { hood: 'ON' } → vstavaný digestor do dna skrinky","left_end / right_end":"ukončenie radu: options { left_end: 'Áno' }"},"decor_info":"Dekor stien a podlahy: pb.decors('wall') (133 farieb, napr. 'All White', 'Dimity', 'Dix Blue'), pb.decors('floor') (300 podláh, napr. 'EBL001 ST54 classic wv4 frontal 10DE flo').","style_handles_note":"Chladničkové vysoké skrinky (1KS_V-CH…) majú hodnoty s dovetkom „na vysokej skrini“ („Štandardné úchytky na vysokej skrini“, „Úchytky na hranu na vysokej skrini“, „UKW profil stredný“). Do style píš bežný názov („Štandardné úchytky“) — nástroj ho na týchto skrinkách priradí sám.","values_info":"PRESNÉ hodnoty pre materials. Zadávaj KÓD (pred „=“). Iné hodnoty (napr. RAL odtiene, dekor dvierok ako pracovnú dosku) neexistujú — vyber najbližšiu z tohto zoznamu a uveď to v _assumptions.","values":{"door_material / primary_spray (farba striekaných dvierok, pri door_material = P…)":["antracit = Antracit","arkticka_siva = Arktická sivá","biela_traffic = Biela Traffic","eukalyptovo_zelena = Eukalyptovo zelená","kamenna_siva = Kamenná sivá","karatovo_bezova = Karátovo béžová","kasmirovo_seda = Kašmírovo šedá","kremovo_bezova = Krémovo béžová","kurkuma = Kurkuma","modro_fialova = Modro fialová","modra_royal = Modrá Royal","modra_blankytna = Modrá blankytná","okrova = Okrová","orientalna_cervena = Orientálna červená","ruzova = Ružová","sivo_zelena = Sivo zelená","cierna = Čierna"],"door_material / primary_akryl (dekor akrylových dvierok, pri door_material = AU01- Akrylové dvierka)":["1648-M-2 = 1648 MAT Biela, 2str","1649-M-2 = 1649 MAT Biela Alpská, 2str","2156-M-2 = 2156 MAT Vanilka, 2str","3501-M-2 = 3501 MAT Ružová Svetlá, 2str","3605-M-2 = 3605 MAT Modrá Arktická, 2str","3801-M-2 = 3801 MAT Karamel, 2str","3802-M-2 = 3802 MAT Kurkuma, 2str","3803-M-2 = 3803 MAT Okrová, 2str","4246-M-2 = 4246 MAT Zelená Bledá, 2str","4258-M-2 = 4258 MAT Zelená Tmavá, 2str","5983-M-2 = 5983 MAT Tehlová, 2str","5987-M-2 = 5987 MAT Ružová, 2str","6220-M-2 = 6220 MAT Modrá Svetlá, 2str","6230-M-2 = 6230 MAT Modrá Tmavá, 2str","7322-M-2 = 7322 MAT Čierna, 2str","7361-M-2 = 7361 MAT Béžová Tmavá, 2str","7393-M-2 = 7393 MAT Béžová Svetlá, 2str","7462-M-2 = 7462 MAT Antracit, 2str","7473-M-2 = 7473 MAT Sivá Svetlá, 2str","7576-M-2 = 7576 MAT Sivá Oceľová, 2str","11046-G-1 = 11046 SCR Biela Arktická, 1str","1982-G-1 = 1982 (2801) SCR Biela Snežná, 1str","5000B-G-1 = 5000B SCR Biela Polar, 1str","7496-G-1 = 7496 (2802) SCR Béžová Svetlá Lesklá, 1str","7498-G-1 = 7498 (2811) SCR Kapučíno, 1str","8421-G-1 = 8421 (2803) SCR Čierna, 1str","85382-G-1 = 85382 SCR Čierno-sivá, 1str","85383-G-1 = 85383 SCR Sivá Kamenná, 1str","85384-G-1 = 85384 SCR Sivá Lesklá, 1str","85468-G-1 = 85468 SCR Sivá svetlá, 1str","11082-M-1 = 11082 MATT Biela Arktická Matná, 1str","11082-M-2 = 11082 MATT Biela Arktická Matná, 2str","1982-M-1 = 1982 (2801) MATT Biela Snežná, 1str","7496-M-1 = 7496 MATT Béžová Svetlá Matná, 1str","7498-M-1 = 7498 MATT Kapučíno Matná, 1str","8421-M-1 = 8421 MATT Čierna, 1str","85382-M-1 = 85382 MATT Čierno-sivá Matná, 1str","85383-M-1 = 85383 MATT Sivá Kamenná, 1str","85468-M-1 = 85468 MATT Sivá Svetlá, 1str","11035-G-1 = 11035 SCR Biela Metalická, 1str","85385-G-1 = 85385 SCR Strieborná Metalická Svetlá, 1str","85387-G-1 = 85387 SCR Strieborná Metalická Tmavá, 1str"],"worktop / w_material (dekor pracovnej dosky; kódy končia _W, dekory dvierok _G sem NEPATRIA)":["4298 UE_W = Light Atelier","4299 UE_W = Dark Atelier","5527 FP_W = Stone Oak","F021 ST75_W = Terrazzo Triestino sivé","F030 ST75_W = Travertin Margalida","F031 ST78_W = Granit Cascia svetlo sivý","F032 ST78_W = Granit Cascia sivý","F052 ST75_W = Travertin Calais","F093 ST7_W = Mramor Cipollino sivý","F095 ST87_W = Mramor Siena sivý","F108 ST9_W = Mramor San Luca","F121 ST87_W = Metal Rock antracitový","F186 ST9_W = Betón Chicago svetlo šedý","F187 ST9_W = Betón Chicago tmavo sivý","F205 ST9_W = Pietra Grigia antracitová","F206 PM_W = Pietra Grigia čierna","F206 ST9_W = Pietra Grigia čierna","F208 ST75_W = Pietra Fanano sivá","F226 ST78_W = Titanit pieskovo béžový","F227 ST78_W = Titanit šedý","F228 ST78_W = Titanit antracitový","F229 ST75_W = Mramor Cremona","F230 ST75_W = Pietra Fanano svetlo šedá","F234 ST76_W = Bridlica Scivaro svetlo šedá","F235 ST76_W = Bridlica Scivaro","F237 ST76_W = Bridlica Cupria","F243 ST76_W = Mramor Candela svetlo sivý","F251 ST9_W = Kameň Gavi taupe","F302 ST87_W = Ferro bronzový","F352 ST76_W = Terra Basaltino","F486 ST76_W = Sparkle Grain biely","F502 ST7_W = Hliník jemne kartáčovaný","F620 ST87_W = Oceľ šedá antracitová","F638 ST10_W = Chromix strieborný","F675 ST75_W = Calvia kameň svetlo šedý","F676 ST75_W = Calvia kameň pieskovo šedý","F800 ST9_W = Mramor krištáľový","H011 G8_W = Smrek Nebrodi rustikálny","H1145 ST10_W = Dub Bardolino prírodný","H1180 ST37_W = Dub Halifax prírodný","H1181 ST37_W = Dub Halifax tabakový","H1303 ST12_W = Dub Belmont hnedý","H1313 ST10_W = Dub Whiteriver sivohnedý","H1318 ST10_W = Dub divoký prírodný","H1344 ST32_W = Dub Sherman koňakovo hnedý","H1357 ST10_W = Dub Spree šedobéžový","H1385 ST40_W = Dub Casella prírodný","H1386 ST40_W = Dub Casella hnedý","H1401 ST22_W = Pinie Cascina","H193 ST12_W = Dub parketa","H197 ST10_W = Drevo Vintage prírodné","H2032 ST10_W = Dub Hunton svetlý","H2033 ST10_W = Dub Hunton tmavý","H2409 G8_W = Dub Cardiff hnedý","H305 ST12_W = Dub Tonsberg prírodný","H3133 ST12_W = Dub Davos lanýžovohnedý","H3157 ST12_W = Dub Vicenza","H3176 ST37_W = Dub Halifax cínový","H3303 ST10_W = Dub Hamilton prírodný","H3331 ST10_W = Dub Nebraska prírodný","H3359 ST32_W = Dub Davenport prírodný svetlý","H3730 ST10_W = Hickory prírodný","K002 FP_W = Grey Craft Oak","K003 FP_W = Gold Craft Oak","K013 SU_W = Sand Artisan Beech","K016 SU_W = Carbon Marine Wood","K023 SQ_W = Venato","K023 SU_W = Venato","K028 SU_W = Portland","K029 SU_W = Linen Block Wood","K030 SU_W = Java Block Wood","K091 FP_W = Light Porterhouse Oak","K092 FP_W = Dark Porterhouse Oak","K093 SL_W = Grey Emperador Marble","K095 SU_W = Light Terrazzo Marble","K105 FP_W = Raw Endgrain Oak","K107 FP_W = Elegance Endgrain Oak","K200 RS_W = Light Grey Concrete","K201 RS_W = Dark Grey Concrete","K203 PE_W = Anthracite Granite","K204 PE_W = Classic Granite","K205 RS_W = Black Concrete","K206 PE_W = Porterhouse Walnut","K207 RS_W = Grey Galaxy","K209 RS_W = Crema Limestone","K210 PE_W = Black Flint","K212 PA_W = Beige Royal Marble","K213 RS_W = Dark Tivoli","K214 RS_W = Light Tivoli","K215 BS_W = White Dunes","K217 GG_W = White Andromeda","K217 GM_W = White Andromeda","K218 GG_W = Black Andromeda","K2738 FP_W = Torro Cremona Oak","K349 RT_W = Silk Flow","K350 RT_W = Concrete Flow","K351 RT_W = Rusty Flow","K352 RT_W = Iron Flow","K353 RT_W = Charcoal Flow","K365 FP_W = Coast Evoke Oak","K367 PH_W = Cream Navona","K368 PH_W = Grey Atlantic Marble","K369 PH_W = Cloud Nebula","K523 PE_W = Platinium Disk","K535 RW_W = Gold Baroque Oak","K536 RW_W = Amber Baroque Oak","K537 RW_W = Ristretto Baroque Oak","K538 PN_W = Dovetail Arosa","K539 PN_W = Fossil Arosa","K540 PN_W = Grey Albus","K544 RW_W = Hazel Silverjack Oak","K545 RW_W = Vintage Silverjack Oak","K549 SL_W = Sand Venera","K550 SL_W = Dove Venera","K551 SU_W = Calacatta Olympus","K552 SU_W = White Iceberg Marble","K553 SU_W = Galaxus","K698 PN_W = Nero Bronzo","K699 PN_W = Calacatta Ambrosio","K703 PN_W = Portobello Elegante","K704 PN_W = Perlino Sabbia","K7045 RS_W = Satin","K705 PN_W = Stonehaven Sand","K8685 RS_W = Snow White","U702 ST78_W = Kašmírovo šedá","U763 ST76_W = Perlová sivá","U999 PM_W = Čierna","U999 ST78_W = Čierna","W1000 ST76_W = Prémiová biela","W1100 PM_W = Alpská biela"]},"_build":{"info":"Len pre nástroj (do instrukcie.md sa nedostane). excluded_modules = moduly katalógu, ktoré AI zámerne nedostane (obklady, sokel, testovacie).","excluded_modules":["1KS_H-OBL-36","1KS_H-obklad-TV","1KS_H-obklad-TH","1KS_H-obklad-DVIERKA","1KS_H-OBL-HOR-18","1KS_V-OBL-36","1KS_V-OBL-DVIERKA","1KS_H-OBL-HOR-36","plinth","1KS_S-sokel","1KS_V_OTV2","KLASIK_LAVICA-1P","1KS_V_OT10","winefridge","1KS_H-OBL-DVIERKA","1KS_H-OBL-HOR-DVIERKA"]}}
const VERZIA = "2026-11-20 05:32"
const fmtKatalog = k => JSON.stringify(k).replace(/\],\["/g, '],\n["').replace(/":\{/g, '":\n{')
const instrukcie = () => {
let kat = null, src = null, report = []
try {
const r = window.pb.aiCatalog(KATALOG_ZAKLAD)
kat = r.katalog; report = r.report
src = 'Prečítané priamo z plánovača ' + new Date().toLocaleString('sk-SK')
} catch (e) { report = ['katalóg z plánovača sa nepodarilo prečítať: ' + (e && e.message || e)] }
if (!kat) {
kat = Object.assign({}, KATALOG_ZAKLAD)
delete kat._build
src = 'Zostavené ' + VERZIA
}
console.info('instrukcie.md — katalóg:', src, report)
return INSTRUKCIE.replace('@@KATALOG@@', () => fmtKatalog(kat)).replace('@@ZOSTAVENE@@', () => src)
}
const download = () => {
if (typeof KATALOG_ZAKLAD === 'string') { alert('Súbor instrukcie.md je len v zostavenom nástroji (dist).'); return }
const a = document.createElement('a')
a.href = URL.createObjectURL(new Blob([instrukcie()], { type: 'text/markdown;charset=utf-8' }))
a.download = 'instrukcie.md'
document.body.appendChild(a)
a.click()
setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}
const help = () => {
const open = document.getElementById(ID + '-box')
if (open && open.dataset.kind === 'help') { open.remove(); return }
box(`<b class="ok">Ako navrhnúť kuchyňu s AI</b>
<ol>
<li><b>Stiahni súbor instrukcie.md</b> (tlačidlo nižšie).</li>
<li>Otvor nový chat v ľubovoľnej AI (ChatGPT, Claude, Gemini, Grok…) a <b>prilož instrukcie.md spolu s podkladmi</b>: náčrt, PDF od projektanta, fotku alebo pár slov o miestnosti. Žiadny prompt písať netreba.</li>
<li>AI ti rovno vráti súbor <b>kuchyna.json</b>. Stiahni ho. (Ak niečo podstatné chýba, AI sa raz opýta.)</li>
<li><b>Klikni na AI</b> a vyber súbor (alebo ho na tlačidlo pretiahni). Kuchyňa sa postaví sama.</li>
<li>Ak niečo nesedí, stav sa sám skopíruje — vlož ho do toho istého chatu s AI, napíš, čo zmeniť, a nahraj nový súbor.</li>
<li>Hotový návrh skontroluj a <b>ulož</b> (Uložiť).</li>
</ol>Tip: pravý klik na AI postaví kuchyňu zo skopírovanej odpovede AI.`,
[{ label: 'Stiahnuť instrukcie.md', run: download }], 'help')
}
const tip = box
const copyState = async () => {
let state
try {
const d = pb.describe()
state = {
stav_z_prodboardu: true,
nepostavene: last && last.changed === false || undefined,
warnings: last && last.warnings || [],
errors: (last && last.errors || []).filter(e => e.message).concat(d.errors),
room: d.room,
items: d.items.map(i => i.wall === 'free'
? { code: i.code, kind: i.kind, wall: 'free', x: i.x, z: i.z, rotation: i.rotation, width: i.width, height: i.height, bottom: i.bottom }
: { code: i.code, kind: i.kind, wall: i.wall, at: i.at, width: i.width, height: i.height, bottom: i.bottom }),
automaticky_doplnene: d.injected.map(i => i.code),
cena: d.total,
}
} catch (e) { state = { chyba: String(e.message || e) } }
const text = 'Toto je stav po postavení v Prodboarde. Oprav návrh a vráť celý JSON (aj ako súbor kuchyna.json).\n```json\n' +
JSON.stringify(state, null, 1) + '\n```'
try { await navigator.clipboard.writeText(text); return true }
catch (e) { console.log(text); return false }
}
const report = async r => {
const n = r.items.length
const ok = r.changed !== false && !r.errors.length && !r.warnings.length
let head
if (r.changed === false) head = '<b class="err">Nepostavené</b> — otvorený projekt ostal bez zmeny.'
else if (ok) head = `<b class="ok">✨ Kuchyňa je hotová</b> — ${n} prvkov` +
(r.project && r.project.total != null
? `, ${r.project.total.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '') +
'.\nSkontroluj návrh a ulož ho (Uložiť).'
else head = `<b class="warn">Postavené s problémami</b> — ${n} prvkov.`
const items = r.warnings.map(esc).concat(r.errors.map(e =>
esc(e.message || `${e.error}: ${e.first || '?'}${e.second ? ' × ' + e.second : ''}`)))
let foot = ''
if (!ok) foot = (await copyState())
? '\nStav pre AI je skopírovaný — vlož ho do AI a napíš, čo opraviť.'
: '\nStav pre AI je v konzole prehliadača (F12).'
box(head + (items.length ? '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>' : '') + foot)
}
const edge = state => {
let el = document.getElementById(ID + '-edge')
if (!el) {
el = document.createElement('div')
el.id = ID + '-edge'
el.innerHTML = '<i></i>'
document.body.appendChild(el)
}
el.className = state || ''
if (state === 'flash') setTimeout(() => { if (el.className === 'flash') el.className = '' }, 1400)
}
const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
let busyNow = false
const run = async text => {
if (busyNow || !allowed()) return
if (!window.pb) { box('<b class="err">Chýba prodboard-api.js.</b>'); return }
let spec
try { spec = parseSpec(text) } catch (e) { box(`<b class="err">Neplatný súbor.</b>\n${esc(e.message)}`); return }
const pre = pb.check(spec)
if (pre.errors.length) { last = { items: [], warnings: pre.warnings, errors: pre.errors, changed: false }; await report(last); return }
if (pb.project().hasChanges && !(await ask('<b class="warn">Otvorený projekt má neuložené zmeny.</b>\nZahodiť ich a postaviť nový návrh?', 'Postaviť'))) return
if (busyNow) return
busyNow = true
btn.classList.add('busy')
box(null)
edge('on')
let built = false
try {
await frame()                                   // nech sa žiara ukáže skôr, než stavba zamestná prehliadač
await pb.newProject()
await new Promise(r => setTimeout(r, 800))
last = pb.build(spec)
if (last.changed !== false) {
await new Promise(r => setTimeout(r, 1500))   // prepočet ceny
last.errors = last.errors.filter(e => e.message).concat(pb.validate())
last.project = pb.project()
try { pb.view('3d') } catch (e) {  }
built = true
}
edge(built ? 'flash' : '')
if (built) { btn.classList.remove('done'); void btn.offsetWidth; btn.classList.add('done') }
await report(last)
} catch (e) {
console.error(e)
last = { items: [], warnings: [], errors: [{ error: 'build', message: String(e.message || e) }], changed: false }
edge('')
await report(last)
} finally {
busyNow = false
btn.classList.remove('busy')
}
}
const readFile = file => {
if (!file) return
if (file.size > 2 * 1024 * 1024) { tip('<b class="err">Súbor je príliš veľký</b> (max. 2 MB).'); return }
const fr = new FileReader()
fr.onload = () => run(String(fr.result))
fr.onerror = () => tip(`<b class="err">Súbor sa nepodarilo prečítať:</b> ${esc(file.name)}`)
fr.readAsText(file, 'utf-8')
}
let btn
const add = () => {
if (document.getElementById(ID) || !document.body) return
const style = document.createElement('style')
style.id = ID + '-style'
style.textContent = css
document.head.appendChild(style)
btn = document.createElement('button')
btn.id = ID
btn.type = 'button'
btn.setAttribute('aria-label', 'AI — nahrať súbor s návrhom kuchyne')
btn.innerHTML = '<span class="orb"><span class="b1"></span><span class="b2"></span><span class="b3"></span><span class="b4"></span></span><span class="shine"></span><span class="txt">AI</span>'
const input = document.createElement('input')
input.type = 'file'
input.accept = '.json,.txt,application/json,text/plain'
input.style.display = 'none'
input.addEventListener('change', () => { readFile(input.files[0]); input.value = '' })
const ripple = () => {
const s = document.createElement('span')
s.className = 'ripple'
btn.appendChild(s)
setTimeout(() => s.remove(), 750)
}
btn.addEventListener('click', () => { ripple(); if (!busyNow) input.click() })
btn.addEventListener('contextmenu', async e => {
e.preventDefault()
ripple()
try { run(await navigator.clipboard.readText()) }
catch (err) { tip('<b class="warn">Schránku sa nepodarilo prečítať.</b> Povoľ prístup ku schránke alebo nahraj súbor.') }
})
btn.addEventListener('dragover', e => { e.preventDefault(); btn.classList.add('drag') })
btn.addEventListener('dragleave', () => btn.classList.remove('drag'))
btn.addEventListener('drop', e => {
e.preventDefault(); btn.classList.remove('drag')
readFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0])
})
const hb = document.createElement('button')
hb.id = ID + '-help'
hb.type = 'button'
hb.textContent = '?'
hb.setAttribute('aria-label', 'Návod k tlačidlu AI')
hb.addEventListener('click', help)
document.body.appendChild(input)
document.body.appendChild(hb)
document.body.appendChild(btn)
if (window.__pbEmployeesOnly || allowList.length) {
const sync = () => {
const ok = allowed()
btn.style.display = hb.style.display = ok ? '' : 'none'
if (!ok) { const b = document.getElementById(ID + '-box'); if (b) b.remove() }
}
sync()
setInterval(sync, 3000)   // prihlásenie/odhlásenie počas práce
}
}
window.pbAi = { run: t => run(t), user, allowed, instrukcie }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add)
else add()
})()

})();
