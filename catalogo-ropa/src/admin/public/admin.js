const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { data });
  return data;
};

let meta; let items = []; let selected = new Set(); let current = null; let imgs = [];

async function init() {
  meta = await api('/api/meta');
  for (const s of meta.statuses) $('#f-status').insertAdjacentHTML('beforeend', `<option>${s}</option>`);
  for (const c of meta.categories) {
    $('#f-cat').insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`);
    $('#bulk-cat').insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`);
  }
  ['#f-status', '#f-cat', '#f-errors', '#f-q'].forEach((s) => $(s).addEventListener('input', renderList));
  document.querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', () => bulk(b.dataset.bulk)));
  $('#bulk-cat').addEventListener('change', (e) => e.target.value && bulk('category', e.target.value));
  await loadList();
}

async function loadList() { items = await api('/api/products'); renderList(); }

function renderList() {
  const st = $('#f-status').value; const cat = $('#f-cat').value; const onlyErr = $('#f-errors').checked; const q = $('#f-q').value.toLowerCase();
  const shown = items.filter((p) => (!st || p.status === st) && (!cat || p.category === cat) && (!onlyErr || p.errors.length) && (!q || `${p.title} ${p.id}`.toLowerCase().includes(q)));
  $('#list').innerHTML = shown.map((p) => `<div class="item ${current?.id === p.id ? 'active' : ''}" data-id="${p.id}">
    <input type="checkbox" ${selected.has(p.id) ? 'checked' : ''} data-sel="${p.id}">
    ${p.cover ? `<img src="${esc(p.cover)}" loading="lazy" alt="">` : '<div class="ph"></div>'}
    <div class="meta"><b>${esc(p.title)}</b>
      <span class="badge ${p.status}">${p.status}</span>${p.errors.length ? `<span class="badge err">${p.errors.length} err</span>` : ''}${p.warnings.length ? `<span class="badge warn">${p.warnings.length} aviso</span>` : ''}
      <div>${p.price_eur ?? '—'} € · ${p.images} fotos${p.margin ? ` · ${p.margin.gross_margin_pct}%` : ''}</div></div></div>`).join('') || '<p>No hay productos.</p>';
  $('#sel-count').textContent = `${selected.size} seleccionados`;
}

$('#list').addEventListener('click', (e) => {
  const sel = e.target.dataset.sel;
  if (sel) { e.target.checked ? selected.add(sel) : selected.delete(sel); $('#sel-count').textContent = `${selected.size} seleccionados`; return; }
  const item = e.target.closest('.item');
  if (item) openEditor(item.dataset.id);
});

async function bulk(action, value) {
  if (!selected.size) return alert('Selecciona productos primero');
  const res = await api('/api/products', { method: 'POST', body: { ids: [...selected], action: action === 'archive' ? 'status' : action, value: action === 'archive' ? 'archived' : value } });
  const failed = res.filter((r) => !r.ok);
  if (failed.length) alert(`No se pudieron aprobar ${failed.length}:\n` + failed.map((f) => `${f.id}: ${f.errors.join(', ')}`).join('\n'));
  selected.clear(); $('#bulk-cat').value = '';
  await loadList();
}

async function openEditor(id) {
  const data = await api(`/api/products/${id}`);
  current = data.product;
  imgs = current.images.map((img, index) => ({ index, type: img.type, publish: img.publish !== false && !['discard', 'size_chart'].includes(img.type), img }));
  imgs.sort((a, b) => (a.img.order ?? 999) - (b.img.order ?? 999));
  document.querySelector('main').classList.add('with-editor');
  renderEditor(data);
  renderList();
}

function imgSrc(img) {
  if (img.files?.thumb) return `/media/${img.files.thumb}`;
  if (img.local) return `/${img.local}`;
  return '';
}

function renderEditor(data) {
  const p = current;
  const ed = $('#editor');
  ed.hidden = false;
  const chart = JSON.stringify(p.size_chart_cm || {}, null, 0);
  ed.innerHTML = `<h2>${esc(p.id)} <span class="badge ${p.status}">${p.status}</span></h2>
  <div class="msgs">${data.errors.map((e) => `<div class="e">✗ ${esc(e)}</div>`).join('')}${data.warnings.map((w) => `<div class="w">! ${esc(w)}</div>`).join('')}</div>
  <label>Título (ES)</label><input id="e-title" value="${esc(p.title)}">
  <div class="margin">Original: ${esc(p.title_original)} · <a href="${esc(p.source?.url)}" target="_blank" rel="noopener">ver en proveedor</a></div>
  <div class="two">
    <div><label>Categoría</label><select id="e-cat"><option value="">—</option>${meta.categories.map((c) => `<option value="${c.id}" ${c.id === p.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div><label>Precio € (coste ${p.source?.cost_cny ?? '—'} CNY)</label><input id="e-price" type="number" step="0.01" value="${p.price_eur ?? ''}">
    ${data.margin ? `<div class="margin">Coste puesto ${data.margin.landed_cost_eur} € · margen ${data.margin.gross_margin_eur} € (${data.margin.gross_margin_pct}%)</div>` : ''}</div>
  </div>
  <label>Composición (obligatoria, con %)</label><input id="e-comp" value="${esc(p.composition)}" placeholder="70% algodón, 30% poliéster">
  <div class="two"><div><label>Cuidados</label><input id="e-care" value="${esc(p.care)}"></div>
  <div><label>Nota de ajuste</label><input id="e-fit" value="${esc(p.fit_note)}" placeholder="Patrón oversize"></div></div>
  <label>Medidas en cm (JSON: {"M":{"pecho":112,"largo":70}})</label><textarea id="e-chart" rows="2">${esc(chart)}</textarea>
  <div class="two">
    <div><label>Colores (separados por coma)</label><input id="e-colors" value="${esc(p.colors.join(', '))}"></div>
    <div><label>Tallas (separadas por coma)</label><input id="e-sizes" value="${esc(p.sizes.join(', '))}"></div>
  </div>
  <label>Disponibilidad</label><select id="e-stock">
    <option value="">Sin cambios (${esc([...new Set(p.variants.map((v) => v.stock))].join(', '))})</option>
    <option value="on_demand">Bajo pedido</option><option value="in_stock">En stock</option><option value="out_of_stock">Agotado</option></select>
  <div class="margin">${p.variants.length} variantes · ${p.source?.platform || ''}${p.review?.notes ? ` · Nota del proveedor: ${esc(p.review.notes.slice(0, 160))}` : ''}</div>
  <label>Fotos (orden = posición en la web; la 1 es la portada)</label>
  <div class="imgs" id="e-imgs"></div>
  <div class="actions">
    <button id="save">Guardar</button>
    <button id="approve" class="ghost">Guardar y aprobar</button>
    <button id="close" class="ghost">Cerrar</button>
  </div>`;
  renderImgs();
  $('#save').onclick = () => save();
  $('#approve').onclick = () => save('approved');
  $('#close').onclick = () => { ed.hidden = true; current = null; document.querySelector('main').classList.remove('with-editor'); renderList(); };
}

function renderImgs() {
  let n = 0;
  $('#e-imgs').innerHTML = imgs.map((x, i) => {
    const on = x.publish && !['discard', 'size_chart'].includes(x.type);
    return `<div class="img ${on ? '' : 'off'}">
      ${imgSrc(x.img) ? `<img src="${esc(imgSrc(x.img))}" alt="">` : ''}
      <div class="row"><span class="pos">${on ? `#${++n}` : '—'}</span> <small>${esc(x.img.reason || '')} ${x.img.score ?? ''}</small></div>
      <select data-type="${i}">${meta.imageTypes.map((t) => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div class="row">
        <button class="ghost" data-up="${i}" title="Subir">↑</button>
        <button class="ghost" data-down="${i}" title="Bajar">↓</button>
        <button class="ghost" data-cover="${i}" title="Poner de portada">★</button>
        <label><input type="checkbox" data-pub="${i}" ${on ? 'checked' : ''}> pub</label>
      </div></div>`;
  }).join('');
}

$('#editor').addEventListener('click', (e) => {
  const d = e.target.dataset;
  const move = (from, to) => { if (to < 0 || to >= imgs.length) return; const [x] = imgs.splice(from, 1); imgs.splice(to, 0, x); renderImgs(); };
  if (d.up) move(+d.up, +d.up - 1);
  if (d.down) move(+d.down, +d.down + 1);
  if (d.cover) { move(+d.cover, 0); imgs[0].publish = true; if (['discard', 'size_chart', 'unknown'].includes(imgs[0].type)) imgs[0].type = 'packshot'; renderImgs(); }
});
$('#editor').addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d.type) { imgs[+d.type].type = e.target.value; imgs[+d.type].publish = !['discard', 'size_chart'].includes(e.target.value); renderImgs(); }
  if (d.pub) { imgs[+d.pub].publish = e.target.checked; renderImgs(); }
});

async function save(status) {
  let chart;
  try { chart = JSON.parse($('#e-chart').value || '{}'); } catch { return alert('Las medidas no son un JSON válido'); }
  const body = {
    title: $('#e-title').value.trim(), category: $('#e-cat').value,
    price_eur: $('#e-price').value ? Number($('#e-price').value) : null,
    composition: $('#e-comp').value.trim(), care: $('#e-care').value.trim(), fit_note: $('#e-fit').value.trim(),
    size_chart_cm: chart,
    colors: $('#e-colors').value.split(',').map((x) => x.trim()).filter(Boolean),
    sizes: $('#e-sizes').value.split(',').map((x) => x.trim()).filter(Boolean),
    ...($('#e-stock').value ? { stock: $('#e-stock').value } : {}),
    images: imgs.map((x) => ({ index: x.index, type: x.type, publish: x.publish })),
  };
  if (status) body.status = status;
  try {
    const data = await api(`/api/products/${current.id}`, { method: 'PUT', body });
    current = data.product;
    imgs = current.images.map((img, index) => ({ index, type: img.type, publish: img.publish, img }));
    renderEditor(data);
    await loadList();
  } catch (e) {
    alert(`${e.message}\n${(e.data?.errors || []).join('\n')}`);
  }
}

init();
