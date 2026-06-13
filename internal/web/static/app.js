(function () {
  const cfg = window.MIHOMO_WEB || {};
  const qs = new URLSearchParams(location.search);
  const CONNECTION_COLUMNS = [
    ['type', '类型'],
    ['process', '进程'],
    ['source', '来源'],
    ['destination', '目标 IP'],
    ['sniffHost', '嗅探域名'],
    ['rule', '规则'],
    ['chains', '节点链'],
    ['duration', '连接时间'],
    ['downSpeed', '下载速率'],
    ['upSpeed', '上传速率'],
    ['download', '下载'],
    ['upload', '上传'],
    ['close', '关闭'],
  ];
  const state = {
    token: localStorage.getItem('mihomoWebToken') || '',
    targetURL: cfg.fixedTarget ? (cfg.mihomoURL || '') : '',
    targetSecret: cfg.fixedTarget ? (cfg.mihomoSecret || '') : '',
    chartStyle: localStorage.getItem('chartStyle') || 'ocean',
    proxyView: localStorage.getItem('proxyView') || qs.get('tab') || 'groups',
    proxyDelays: loadProxyDelays(),
    backendStore: loadBackendStore(),
    connections: { records: new Map(), view: 'active', type: 'all', paused: false, sortKey: '', sortDir: 'desc', visibleColumns: loadConnectionColumns() },
    logs: [],
    paused: false,
  };

  bootstrapURLParams();
  hydrateBackendTarget();
  applyTheme(localStorage.getItem('theme') || qs.get('theme') || 'auto');
  applyChartStyle(state.chartStyle);
  markActiveNav();
  wireCommon();
  if (shouldRedirectToBackendManager()) {
    location.replace('/backends');
    return;
  }

  if (cfg.page === 'login') loginPage();
  if (cfg.page === 'overview') overviewPage();
  if (cfg.page === 'proxies') proxiesPage();
  if (cfg.page === 'rules') rulesPage();
  if (cfg.page === 'connections') connectionsPage();
  if (cfg.page === 'logs') logsPage();
  if (cfg.page === 'backends') backendsPage();
  if (cfg.page === 'config') configPage();
  if (cfg.page === 'about') aboutPage();

  function bootstrapURLParams() {
    if (qs.get('hostname')) {
      const scheme = qs.get('scheme') || 'http';
      const port = qs.get('port') ? ':' + qs.get('port') : '';
      state.targetURL = `${scheme}://${qs.get('hostname')}${port}`;
    }
    if (qs.get('secret')) {
      state.targetSecret = qs.get('secret');
    }
    if (qs.get('ui_secret')) {
      state.token = qs.get('ui_secret');
      localStorage.setItem('mihomoWebToken', state.token);
    }
    if (qs.get('secret') || qs.get('ui_secret')) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }

  function hydrateBackendTarget() {
    if (cfg.fixedTarget || state.targetURL) return;
    const active = getActiveBackend();
    if (!active) return;
    state.targetURL = String(active.url || '').trim();
    state.targetSecret = String(active.secret || '').trim();
  }

  function shouldRedirectToBackendManager() {
    if (cfg.page === 'login' || cfg.page === 'backends') return false;
    return !cfg.fixedTarget && !state.targetURL;
  }

  function headers(extra) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (state.targetSecret) h.Authorization = 'Bearer ' + state.targetSecret;
    return h;
  }

  async function request(path, options) {
    if (!state.targetURL) {
      throw new Error('missing mihomo target');
    }
    const method = (options && options.method) || 'GET';
    if (cfg.readOnly && method !== 'GET') {
      throw new Error('read only mode');
    }
    const res = await fetch(apiURL(path), Object.assign({}, options, { headers: headers(options && options.headers) }));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json') ? res.json() : res.text();
  }

  function apiURL(path) {
    return state.targetURL.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  }

  function wireCommon() {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', function () {
      const current = localStorage.getItem('theme') || 'auto';
      const next = current === 'auto' ? 'dark' : current === 'dark' ? 'light' : 'auto';
      localStorage.setItem('theme', next);
      applyTheme(next);
    });
  }

  function applyTheme(theme) {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.querySelector('.icon-auto').style.display = theme === 'auto' ? '' : 'none';
      btn.querySelector('.icon-sun').style.display = theme === 'light' ? '' : 'none';
      btn.querySelector('.icon-moon').style.display = theme === 'dark' ? '' : 'none';
    }
  }

  function applyChartStyle(style) {
    const next = style || 'ocean';
    state.chartStyle = next;
    document.documentElement.dataset.chartStyle = next;
    localStorage.setItem('chartStyle', next);
  }

  function markActiveNav() {
    document.querySelectorAll('.nav-links a').forEach(a => {
      if (a.dataset.page === cfg.page) a.classList.add('active');
    });
  }

  function loginPage() {
    document.getElementById('login-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const token = new FormData(event.currentTarget).get('token');
      localStorage.setItem('mihomoWebToken', token);
      document.cookie = 'mihomo_web_token=' + encodeURIComponent(token) + '; path=/; SameSite=Lax';
      location.href = '/';
    });
  }

  function overviewPage() {
    const CHART_LEN = 60;
    const chartDown = sparkline('chart-down', CHART_LEN, '--chart-down');
    const chartUp = sparkline('chart-up', CHART_LEN, '--chart-up');
    const chartMem = sparkline('chart-mem', CHART_LEN, '--chart-mem');

    let downloadTotal = 0;
    let uploadTotal = 0;

    openStream('/traffic', data => {
      document.getElementById('traffic-up').textContent = size(data.up) + '/s';
      document.getElementById('traffic-down').textContent = size(data.down) + '/s';
      chartDown.push(data.down);
      chartUp.push(data.up);
    });
    openStream('/memory', data => {
      document.getElementById('memory-inuse').textContent = size(data.inuse);
      chartMem.push(data.inuse);
    });

    function pollConnections() {
      request('/connections').then(data => {
        downloadTotal = data.downloadTotal || 0;
        uploadTotal = data.uploadTotal || 0;
        document.getElementById('download-total').textContent = size(downloadTotal);
        document.getElementById('upload-total').textContent = size(uploadTotal);
        document.getElementById('active-connections').textContent = (data.connections || []).length;
      }).catch(() => {});
    }
    pollConnections();
    setInterval(() => { if (!document.hidden) pollConnections(); }, 2000);
  }

  function sparkline(containerId, maxLen, colorVar) {
    const container = document.getElementById(containerId);
    if (!container) return { push() {} };
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 100 100');
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-width', '0.5');
    const area = document.createElementNS(ns, 'polygon');
    const defs = document.createElementNS(ns, 'defs');
    const grad = document.createElementNS(ns, 'linearGradient');
    grad.id = containerId + '-grad';
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    const stop1 = document.createElementNS(ns, 'stop');
    stop1.setAttribute('offset', '0'); stop1.setAttribute('stop-opacity', '0.27');
    const stop2 = document.createElementNS(ns, 'stop');
    stop2.setAttribute('offset', '1'); stop2.setAttribute('stop-opacity', '0');
    grad.append(stop1, stop2);
    defs.appendChild(grad);
    area.setAttribute('fill', `url(#${grad.id})`);
    svg.append(defs, area, line);
    container.appendChild(svg);
    const pts = [];

    function applyColor() {
      const color = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
      line.setAttribute('stroke', color);
      stop1.setAttribute('stop-color', color);
      stop2.setAttribute('stop-color', color);
    }
    applyColor();
    new MutationObserver(applyColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

    function push(v) {
      pts.push(Number(v) || 0);
      if (pts.length > maxLen) pts.shift();
      draw();
    }

    function draw() {
      if (pts.length < 2) return;
      const max = Math.max(...pts, 1);
      const ptsAttr = pts.map((v, i) => {
        const x = (i / (maxLen - 1)) * 100;
        const y = 100 - (v / max) * 96 - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });
      line.setAttribute('points', ptsAttr.join(' '));
      const areaPts = ptsAttr.join(' ') + ` ${((pts.length - 1) / (maxLen - 1) * 100).toFixed(2)},100 0,100`;
      area.setAttribute('points', areaPts);
    }

    return { push };
  }

  async function proxiesPage() {
    const refreshButton = document.querySelector('[data-refresh="proxies"]');
    const search = document.getElementById('proxy-search');
    const tabsRoot = document.getElementById('proxy-tabs');
    if (refreshButton && !refreshButton.dataset.bound) {
      refreshButton.dataset.bound = 'true';
      refreshButton.addEventListener('click', proxiesPage);
    }
    const [proxies, providers] = await Promise.allSettled([request('/proxies'), request('/providers/proxies')]);
    const root = document.getElementById('proxies-view');
    const providerRoot = document.getElementById('proxy-providers');
    root.innerHTML = '';
    providerRoot.innerHTML = '';
    const providerMap = providers.status === 'fulfilled' ? (providers.value.providers || {}) : {};
    if (providers.status === 'fulfilled') renderProviders(providerRoot, providerMap, 'proxies');
    else providerRoot.textContent = '加载 Proxy Provider 失败';
    if (proxies.status !== 'fulfilled') { root.textContent = '加载代理失败'; return; }
    const groups = Object.values(proxies.value.proxies || {}).filter(p => p.all && p.all.length);
    const groupCount = document.getElementById('proxy-group-count');
    const providerCount = document.getElementById('proxy-provider-count');
    if (groupCount) groupCount.textContent = String(groups.length);
    if (providerCount) providerCount.textContent = String(Object.values(providerMap).filter(p => p.vehicleType && p.vehicleType !== 'Compatible').length);
    groups.forEach(group => {
      const el = document.createElement('article');
      el.className = 'proxy-group';
      el.dataset.search = JSON.stringify([group.name, group.type, group.now, ...(group.all || [])]).toLowerCase();
      el.innerHTML = `<div class="proxy-head"><div class="proxy-head-main"><strong>${escapeHTML(group.name)}</strong><div class="proxy-meta"><span>${escapeHTML(group.type || 'Selector')}</span><span class="proxy-badge">${escapeHTML(String(group.all.length))}</span></div></div><div class="proxy-head-actions"><button class="icon-button proxy-collapse-button" type="button" data-collapse aria-label="折叠"></button><button class="icon-button proxy-bolt-button" type="button" data-group-delay aria-label="整组测速"></button></div></div><div class="proxy-nodes"></div>`;
      const nodes = el.querySelector('.proxy-nodes');
      group.all.forEach(name => {
        const item = document.createElement('article');
        item.className = 'proxy-node-card' + (name === group.now ? ' active' : '');
        item.dataset.search = JSON.stringify([group.name, name]).toLowerCase();
        const main = document.createElement('div');
        main.className = 'proxy-node-main';
        main.innerHTML = `<div class="proxy-node-title-row"><strong>${escapeHTML(name)}</strong><span class="proxy-node-type">${escapeHTML(inferProxyType(proxies.value.proxies && proxies.value.proxies[name]))}</span></div><div class="proxy-node-footer"><span class="proxy-node-kind">${escapeHTML(inferProxyKind(proxies.value.proxies && proxies.value.proxies[name], group))}</span></div>`;
        item.addEventListener('click', () => request('/proxies/' + encodeURIComponent(group.name), { method: 'PUT', body: JSON.stringify({ name }) }).then(proxiesPage));
        const delay = document.createElement('button');
        delay.className = 'proxy-node-delay-button';
        delay.type = 'button';
        applyDelayValue(delay, readProxyDelay(name));
        delay.addEventListener('click', event => {
          event.stopPropagation();
          request('/proxies/' + encodeURIComponent(name) + '/delay?url=https%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=5000')
            .then(data => {
              const value = data.delay == null ? null : Number(data.delay);
              writeProxyDelay(name, value);
              applyDelayValue(delay, value);
            })
            .catch(() => {
              writeProxyDelay(name, null);
              applyDelayValue(delay, null);
            });
        });
        item.append(main, delay);
        nodes.appendChild(item);
      });
      el.querySelector('[data-group-delay]').addEventListener('click', () => {
        request('/group/' + encodeURIComponent(group.name) + '/delay?url=https%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=5000')
          .then(data => {
            const delayMap = buildGroupDelayMap(data, group);
            const cards = el.querySelectorAll('.proxy-node-card');
            cards.forEach((card, i) => {
              const nameEl = card.querySelector('.proxy-node-title-row strong');
              const name = nameEl ? nameEl.textContent.trim() : group.all[i] || '';
              const delayBtn = card.querySelector('.proxy-node-delay-button');
              if (!delayBtn) return;
              let value = delayMap[name];
              if (value === undefined) value = delayMap[String(i)];
              if (value !== undefined) {
                writeProxyDelay(name, value);
                applyDelayValue(delayBtn, value);
              }
            });
          })
          .catch(() => {});
      });
      el.querySelector('[data-collapse]').addEventListener('click', event => {
        const button = event.currentTarget;
        el.classList.toggle('collapsed');
        button.classList.toggle('collapsed', el.classList.contains('collapsed'));
      });
      root.appendChild(el);
    });
    if (tabsRoot && !tabsRoot.dataset.bound) {
      tabsRoot.dataset.bound = 'true';
      tabsRoot.querySelectorAll('[data-proxy-view]').forEach(tab => {
        tab.addEventListener('click', () => setProxyView(tab.dataset.proxyView));
      });
    }
    if (search && !search.dataset.bound) {
      search.dataset.bound = 'true';
      search.addEventListener('input', () => filterProxyCards(search.value));
    }
    setProxyView(state.proxyView || 'groups');
    filterProxyCards(search ? search.value : '');
  }

  async function rulesPage() {
    document.querySelector('[data-refresh="rules"]').addEventListener('click', rulesPage);
    const providers = await request('/providers/rules').catch(() => ({ providers: {} }));
    const rules = await request('/rules').catch(() => ({ rules: [] }));
    const providerRoot = document.getElementById('rule-providers');
    providerRoot.innerHTML = '';
    renderProviders(providerRoot, providers.providers || {}, 'rules');
    document.getElementById('update-all-rule-providers').addEventListener('click', async () => {
      const names = Object.keys(providers.providers || {});
      for (const name of names) await request('/providers/rules/' + encodeURIComponent(name), { method: 'PUT' });
      rulesPage();
    }, { once: true });
    const tbody = document.getElementById('rules-body');
    const filter = document.getElementById('rule-filter');
    const providerCount = document.getElementById('rule-provider-count');
    const listCount = document.getElementById('rule-list-count');
    if (providerCount) providerCount.textContent = String(Object.values(providers.providers || {}).filter(p => p.vehicleType && p.vehicleType !== 'Compatible').length);
    if (listCount) listCount.textContent = String((rules.rules || []).length);
    function draw() {
      const q = filter.value.toLowerCase();
      tbody.innerHTML = '';
      (rules.rules || []).filter(r => JSON.stringify(r).toLowerCase().includes(q)).forEach((r, i) => {
        tbody.insertAdjacentHTML('beforeend', `<tr><td>${i + 1}</td><td>${escapeHTML(r.type)}</td><td>${escapeHTML(r.payload)}</td><td>${escapeHTML(r.proxy)}</td></tr>`);
      });
    }
    filter.addEventListener('input', draw);
    draw();
    document.querySelectorAll('[data-rules-view]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-rules-view]').forEach(b => b.classList.toggle('active', b === button));
        document.querySelectorAll('[data-rules-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.rulesPanel === button.dataset.rulesView));
      });
    });
  }

  function renderProviders(root, providers, kind) {
    Object.values(providers).filter(p => p.vehicleType && p.vehicleType !== 'Compatible').forEach(p => {
      const el = document.createElement('article');
      el.className = 'provider';
      const providerEntries = normalizeProviderEntries(p.proxies);
      const updatedText = formatProviderUpdatedAt(p.updatedAt);
      el.dataset.search = JSON.stringify([p.name, p.vehicleType, updatedText, ...providerEntries.map(entry => entry.name)]).toLowerCase();
      el.innerHTML = `<div class="provider-head"><div class="proxy-head-main"><strong>${escapeHTML(p.name)}</strong><div class="proxy-meta"><span>${escapeHTML(formatProviderVehicleType(p.vehicleType))}</span><span class="proxy-badge">${escapeHTML(String(providerEntries.length))}</span></div></div><div class="proxy-head-actions"><button class="icon-button proxy-collapse-button" type="button" data-collapse aria-label="折叠"></button><button class="icon-button proxy-refresh-button" type="button" data-update aria-label="更新"></button>${kind === 'proxies' ? '<button class="icon-button proxy-bolt-button" type="button" data-health aria-label="健康检查"></button>' : ''}</div></div><p class="provider-updated">${escapeHTML(updatedText)}</p><div class="proxy-nodes provider-nodes"></div><div class="provider-actions"></div>`;
      const nodes = el.querySelector('.provider-nodes');
      providerEntries.forEach(entry => {
        const proxy = document.createElement('article');
        proxy.className = 'proxy-node-card';
        proxy.dataset.search = JSON.stringify([p.name, entry.name, entry.type]).toLowerCase();
        proxy.innerHTML = `<div class="proxy-node-title-row"><strong>${escapeHTML(entry.name)}</strong><span class="proxy-node-type">${escapeHTML(String(entry.type || p.type || 'PROXY').toUpperCase())}</span></div><div class="proxy-node-footer"><span class="proxy-node-kind">${escapeHTML(entry.kind || inferProviderNodeKind(entry.name))}</span></div>`;
        nodes.appendChild(proxy);
      });
      const actions = el.querySelector('.provider-actions');
      const b = document.createElement('button');
      b.className = 'ghost action-button';
      b.type = 'button';
      b.textContent = '更新';
      b.addEventListener('click', () => request(`/providers/${kind}/${encodeURIComponent(p.name)}`, { method: 'PUT' }).then(() => proxiesPage()));
      actions.appendChild(b);
      el.querySelector('[data-update]').addEventListener('click', () => request(`/providers/${kind}/${encodeURIComponent(p.name)}`, { method: 'PUT' }).then(() => proxiesPage()));
      if (kind === 'proxies') {
        const health = document.createElement('button');
        health.className = 'ghost action-button';
        health.type = 'button';
        health.textContent = '健康检查';
        health.addEventListener('click', () => request('/providers/proxies/' + encodeURIComponent(p.name) + '/healthcheck').then(() => proxiesPage()));
        actions.appendChild(health);
        const healthIcon = el.querySelector('[data-health]');
        if (healthIcon) healthIcon.addEventListener('click', () => request('/providers/proxies/' + encodeURIComponent(p.name) + '/healthcheck').then(() => proxiesPage()));
      }
      el.querySelector('[data-collapse]').addEventListener('click', event => {
        const button = event.currentTarget;
        el.classList.toggle('collapsed');
        button.classList.toggle('collapsed', el.classList.contains('collapsed'));
      });
      root.appendChild(el);
    });
  }

  function setProxyView(view) {
    state.proxyView = view || 'groups';
    localStorage.setItem('proxyView', state.proxyView);
    document.querySelectorAll('[data-proxy-view]').forEach(tab => tab.classList.toggle('active', tab.dataset.proxyView === state.proxyView));
    document.querySelectorAll('[data-proxy-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.proxyPanel === state.proxyView));
  }

  function filterProxyCards(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('.proxy-group, .provider').forEach(card => {
      const nodes = Array.from(card.querySelectorAll('.proxy-node-card'));
      const cardText = String(card.dataset.search || '');
      let visibleNodes = 0;
      nodes.forEach(node => {
        const match = !q || String(node.dataset.search || '').includes(q) || cardText.includes(q);
        node.hidden = !match;
        if (match) visibleNodes += 1;
      });
      const cardMatch = !q || cardText.includes(q) || visibleNodes > 0;
      card.hidden = !cardMatch;
    });
  }

  function inferProxyType(proxy) {
    return String(proxy && (proxy.udp ? 'UDP' : proxy.type || 'Proxy') || 'Proxy').toUpperCase();
  }

  function normalizeProviderEntries(proxies) {
    if (!Array.isArray(proxies)) return [];
    return proxies.map(item => {
      if (typeof item === 'string') {
        return { name: item, type: 'PROXY', kind: inferProviderNodeKind(item) };
      }
      const data = item && typeof item === 'object' ? item : {};
      const name = data.name || data.title || data.displayName || JSON.stringify(data);
      const type = data.type || data.adapter || data.protocol || 'PROXY';
      const kind = data.kind || data.vehicleType || data.provider || inferProviderNodeKind(name);
      return { name: String(name), type: String(type), kind: String(kind) };
    });
  }

  function formatProviderVehicleType(value) {
    if (value == null || value === '') return 'Inline';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      return value.type || value.name || value.vehicleType || 'Inline';
    }
    return String(value);
  }

  function readProxyDelay(name) {
    const key = proxyDelayKey(name);
    return Object.prototype.hasOwnProperty.call(state.proxyDelays, key) ? state.proxyDelays[key] : null;
  }

  function writeProxyDelay(name, value) {
    state.proxyDelays[proxyDelayKey(name)] = value;
    localStorage.setItem('proxyDelayCache', JSON.stringify(state.proxyDelays));
  }

  function applyDelayValue(button, value) {
    if (!button) return;
    if (value == null || Number.isNaN(Number(value))) {
      button.classList.remove('has-value');
      button.innerHTML = '<span class="sr-only">测速</span>';
      return;
    }
    button.classList.add('has-value');
    button.textContent = Number(value) + ' ms';
  }

  function proxyDelayKey(name) {
    return [state.targetURL || '', state.targetSecret || '', String(name || '')].join('::');
  }

  function buildGroupDelayMap(data, group) {
    const map = {};
    if (!data || typeof data !== 'object') return map;
    if (Array.isArray(data.delays)) {
      data.delays.forEach((item, i) => {
        const name = String(item.name || group.all[i] || '');
        map[name] = item.delay != null ? Number(item.delay) : null;
        map[String(i)] = map[name];
      });
      return map;
    }
    if (Array.isArray(data)) {
      data.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          const name = String(item.name || group.all[i] || '');
          map[name] = item.delay != null ? Number(item.delay) : null;
          map[String(i)] = map[name];
        } else {
          const name = String(group.all[i] || '');
          map[name] = item != null ? Number(item) : null;
          map[String(i)] = map[name];
        }
      });
      return map;
    }
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'number') map[key] = value;
    });
    return map;
  }

  function loadProxyDelays() {
    try {
      const raw = localStorage.getItem('proxyDelayCache');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function defaultConnectionColumns() {
    return CONNECTION_COLUMNS.map(([key]) => key);
  }

  function loadConnectionColumns() {
    try {
      const raw = localStorage.getItem('connectionVisibleColumns');
      const parsed = raw ? JSON.parse(raw) : null;
      const allowed = new Set(CONNECTION_COLUMNS.map(([key]) => key));
      const values = Array.isArray(parsed) ? parsed.filter(key => allowed.has(key)) : [];
      return values.length ? values : defaultConnectionColumns();
    } catch (_) {
      return defaultConnectionColumns();
    }
  }

  function saveConnectionColumns() {
    localStorage.setItem('connectionVisibleColumns', JSON.stringify(state.connections.visibleColumns));
  }

  function visibleConnectionColumns() {
    const visible = new Set(state.connections.visibleColumns || defaultConnectionColumns());
    return CONNECTION_COLUMNS.filter(([key]) => visible.has(key));
  }

  function renderConnectionColumnSettings() {
    const root = document.getElementById('connection-columns-list');
    if (!root) return;
    const visible = new Set(state.connections.visibleColumns || defaultConnectionColumns());
    root.innerHTML = CONNECTION_COLUMNS.map(([key, label]) => `<label class="connection-column-option"><input type="checkbox" value="${key}" ${visible.has(key) ? 'checked' : ''}><span>${label}</span></label>`).join('');
  }

  function applyConnectionColumnSettings() {
    const root = document.getElementById('connection-columns-list');
    if (!root) return;
    const checked = Array.from(root.querySelectorAll('input[type="checkbox"]:checked')).map(item => item.value);
    state.connections.visibleColumns = checked.length ? checked : defaultConnectionColumns();
    if (state.connections.sortKey && !state.connections.visibleColumns.includes(state.connections.sortKey)) {
      state.connections.sortKey = '';
      state.connections.sortDir = 'desc';
    }
    saveConnectionColumns();
    drawConnections();
  }

  function resetConnectionColumnCheckboxes() {
    const root = document.getElementById('connection-columns-list');
    if (!root) return;
    root.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = true; });
  }

  function loadBackendStore() {
    try {
      const raw = localStorage.getItem('mihomoBackendStore');
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return { activeId: '', items: [] };
      return { activeId: parsed.activeId || '', items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch (_) {
      return { activeId: '', items: [] };
    }
  }

  function saveBackendStore() {
    localStorage.setItem('mihomoBackendStore', JSON.stringify(state.backendStore));
  }

  function sortedBackends() {
    return (state.backendStore.items || []).slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function getActiveBackend() {
    if (cfg.fixedTarget) return null;
    return (state.backendStore.items || []).find(item => item.id === state.backendStore.activeId) || null;
  }

  function isActiveBackend(id) {
    return !cfg.fixedTarget && state.backendStore.activeId === id;
  }

  function collectBackendForm(form) {
    return {
      id: String(form.elements.id.value || '').trim(),
      name: String(form.elements.name.value || '').trim(),
      url: String(form.elements.url.value || '').trim(),
      secret: String(form.elements.secret.value || '').trim(),
    };
  }

  function saveBackend(data) {
    const name = data.name || data.url;
    if (!name || !data.url) {
      alert('名称和 Controller URL 不能为空');
      throw new Error('missing backend fields');
    }
    const now = new Date().toISOString();
    const id = data.id || createBackendID();
    const next = { id, name, url: data.url, secret: data.secret, updatedAt: now };
    const items = state.backendStore.items || [];
    const index = items.findIndex(item => item.id === id);
    if (index >= 0) items[index] = next;
    else items.unshift(next);
    state.backendStore.items = items;
    saveBackendStore();
    return next;
  }

  function activateBackend(id) {
    if (cfg.fixedTarget) return;
    const backend = (state.backendStore.items || []).find(item => item.id === id);
    if (!backend) return;
    state.backendStore.activeId = id;
    saveBackendStore();
    state.targetURL = backend.url;
    state.targetSecret = backend.secret;
    backendToast(`已激活「${backend.name}」，<a class="toast-link" href="/proxies">前往代理页</a> 开始使用`);
  }

  function deleteBackend(id) {
    state.backendStore.items = (state.backendStore.items || []).filter(item => item.id !== id);
    if (state.backendStore.activeId === id) {
      state.backendStore.activeId = state.backendStore.items[0] ? state.backendStore.items[0].id : '';
      saveBackendStore();
      state.targetURL = '';
      state.targetSecret = '';
      hydrateBackendTarget();
      if (state.backendStore.activeId) {
        const fallback = (state.backendStore.items || []).find(item => item.id === state.backendStore.activeId);
        backendToast(`已删除旧后端，自动激活「${fallback && fallback.name || '未知'}」`);
      } else {
        backendToast('已删除最后一个后端，请新增配置', 'warning');
      }
      return;
    }
    saveBackendStore();
  }

  function createBackendID() {
    return 'backend-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function backendToast(message, kind) {
    const container = document.getElementById('backend-toast');
    if (!container) return;
    container.className = 'backend-toast' + (kind ? ' toast-' + kind : '');
    container.innerHTML = message;
    container.hidden = false;
    clearTimeout(container._toastTimer);
    container._toastTimer = setTimeout(() => { container.hidden = true; }, 5000);
  }

  function formatBackendUpdatedAt(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '刚刚更新';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  async function testBackend(item, button) {
    if (!item || !item.url) return;
    if (!button) return;
    const originalText = button.textContent;
    button.textContent = '检测中...';
    button.disabled = true;
    try {
      const url = item.url.replace(/\/+$/, '') + '/version';
      const headers = { 'Accept': 'application/json' };
      if (item.secret) headers.Authorization = 'Bearer ' + item.secret;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(res.status + ' ' + (res.statusText || ''));
      const data = await res.json();
      const version = (data && data.version) ? String(data.version).replace(/^mihomo\s*/i, '').replace(/^v/i, '') : JSON.stringify(data).slice(0, 60);
      button.textContent = 'v' + version;
      button.classList.add('backend-test-ok');
    } catch (err) {
      button.textContent = '无法连接';
      button.classList.add('backend-test-fail');
    } finally {
      button.disabled = false;
      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('backend-test-ok', 'backend-test-fail');
      }, 4000);
    }
  }

  function inferProxyKind(proxy, group) {
    if (proxy && proxy.type) return proxy.type;
    if (group && group.type) return group.type;
    return 'Proxy';
  }

  function inferProviderNodeKind(name) {
    const value = String(name || 'Proxy');
    if (/direct/i.test(value)) return 'Direct';
    if (/reject/i.test(value)) return 'Reject';
    return 'Proxy';
  }

  function formatProviderUpdatedAt(value) {
    if (!value) return 'Updated recently';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const delta = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.round(delta / 60000);
    if (minutes < 1) return 'Updated just now';
    if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
  }

  function connectionsPage() {
    const filter = document.getElementById('connection-filter');
    const typeFilter = document.getElementById('connection-type-filter');
    const closeBtn = document.getElementById('close-connections');
    const refresh = document.getElementById('connection-refresh');
    const pause = document.getElementById('connection-pause');
    const columnsToggle = document.getElementById('connection-columns-toggle');
    const columnsPopover = document.getElementById('connection-columns-popover');
    const columnsReset = document.getElementById('connection-columns-reset');
    const columnsConfirm = document.getElementById('connection-columns-confirm');
    const columnsCancel = document.getElementById('connection-columns-cancel');
    document.querySelectorAll('[data-connection-view]').forEach(button => {
      button.addEventListener('click', () => {
        state.connections.view = button.dataset.connectionView || 'active';
        drawConnections();
      });
    });
    if (closeBtn) closeBtn.addEventListener('click', async () => {
      const hasFilter = (filter && filter.value.trim()) || (typeFilter && typeFilter.value);
      if (hasFilter) {
        const rows = filteredConnectionRecords('active');
        if (!rows.length) { alert('当前筛选条件下没有活动连接'); return; }
        if (!confirm(`确认关闭当前过滤出的 ${rows.length} 条活动连接？`)) return;
        for (const item of rows) await request('/connections/' + encodeURIComponent(item.id), { method: 'DELETE' });
        load();
      } else {
        if (confirm('确认关闭全部活动连接？')) request('/connections', { method: 'DELETE' }).then(load);
      }
    });
    if (refresh) refresh.addEventListener('click', load);
    function updateCloseBtnTip() {
      if (!closeBtn) return;
      const hasFilter = (filter && filter.value.trim()) || (typeFilter && typeFilter.value);
      closeBtn.title = hasFilter ? '关闭过滤后的活动连接' : '关闭所有活动连接';
      closeBtn.setAttribute('aria-label', closeBtn.title);
    }
    if (filter) filter.addEventListener('input', () => { drawConnections(); updateCloseBtnTip(); });
    if (typeFilter) typeFilter.addEventListener('change', () => { state.connections.type = typeFilter.value; drawConnections(); updateCloseBtnTip(); });
    if (pause) pause.addEventListener('click', () => {
      state.connections.paused = !state.connections.paused;
      pause.textContent = state.connections.paused ? '▶' : 'Ⅱ';
      pause.setAttribute('aria-label', state.connections.paused ? '继续刷新' : '暂停刷新');
    });
    if (columnsToggle && columnsPopover) columnsToggle.addEventListener('click', () => {
      if (columnsPopover.hidden) {
        renderConnectionColumnSettings();
        columnsPopover.hidden = false;
      } else {
        columnsPopover.hidden = true;
      }
    });
    if (columnsReset) columnsReset.addEventListener('click', resetConnectionColumnCheckboxes);
    if (columnsConfirm && columnsPopover) columnsConfirm.addEventListener('click', () => {
      applyConnectionColumnSettings();
      columnsPopover.hidden = true;
    });
    if (columnsCancel && columnsPopover) columnsCancel.addEventListener('click', () => {
      columnsPopover.hidden = true;
    });
    document.addEventListener('click', (event) => {
      if (columnsPopover && !columnsPopover.hidden) {
        if (!columnsPopover.contains(event.target) && event.target !== columnsToggle && !columnsToggle.contains(event.target)) {
          columnsPopover.hidden = true;
        }
      }
    });
    renderConnectionColumnSettings();
    load();
    setInterval(() => { if (!document.hidden && !state.connections.paused) load(); }, 1000);
    async function load() {
      const data = await request('/connections').catch(() => ({ connections: [] }));
      updateConnectionRecords(data.connections || []);
      drawConnections();
    }
  }

  function updateConnectionRecords(connections) {
    const now = Date.now();
    const seen = new Set();
    connections.forEach(conn => {
      const id = String(conn.id || connectionTarget(conn) || Math.random());
      seen.add(id);
      const previous = state.connections.records.get(id);
      const elapsed = previous ? Math.max((now - previous.lastSeen) / 1000, 0.001) : 0;
      const upload = Number(conn.upload || 0);
      const download = Number(conn.download || 0);
      const upSpeed = previous ? Math.max(0, (upload - previous.upload) / elapsed) : 0;
      const downSpeed = previous ? Math.max(0, (download - previous.download) / elapsed) : 0;
      state.connections.records.set(id, {
        id,
        conn,
        status: 'active',
        lastSeen: now,
        upload,
        download,
        upSpeed,
        downSpeed,
        createdAt: previous && previous.createdAt || connectionStartTime(conn) || now,
        closedAt: 0,
      });
    });
    state.connections.records.forEach((record, id) => {
      if (!seen.has(id) && record.status === 'active') {
        record.status = 'closed';
        record.closedAt = now;
        record.upSpeed = 0;
        record.downSpeed = 0;
      }
    });
    const closed = Array.from(state.connections.records.values()).filter(item => item.status === 'closed').sort((a, b) => b.closedAt - a.closedAt);
    closed.slice(200).forEach(item => state.connections.records.delete(item.id));
  }

  function drawConnections() {
    const root = document.getElementById('connections-view');
    if (!root) return;
    const records = Array.from(state.connections.records.values());
    const active = records.filter(item => item.status === 'active');
    const closed = records.filter(item => item.status === 'closed');
    const activeCount = document.getElementById('connection-active-count');
    const closedCount = document.getElementById('connection-closed-count');
    if (activeCount) activeCount.textContent = String(active.length);
    if (closedCount) closedCount.textContent = String(closed.length);
    document.querySelectorAll('[data-connection-view]').forEach(button => button.classList.toggle('active', button.dataset.connectionView === state.connections.view));
    const rows = filteredConnectionRecords(state.connections.view);
    if (!rows.length) {
      root.innerHTML = '<div class="connection-empty">没有匹配的连接</div>';
      return;
    }
    root.innerHTML = `<table class="connection-table"><thead><tr>${connectionHeadersHTML()}</tr></thead><tbody>${rows.map(connectionRowHTML).join('')}</tbody></table>`;
    root.querySelectorAll('[data-sort-connection]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.sortConnection;
        if (state.connections.sortKey !== key) {
          state.connections.sortKey = key;
          state.connections.sortDir = defaultConnectionSortDir(key);
        } else if (state.connections.sortDir === defaultConnectionSortDir(key)) {
          state.connections.sortDir = state.connections.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.connections.sortKey = '';
          state.connections.sortDir = 'desc';
        }
        drawConnections();
      });
    });
    root.querySelectorAll('[data-close-connection]').forEach(button => {
      button.addEventListener('click', () => request('/connections/' + encodeURIComponent(button.dataset.closeConnection), { method: 'DELETE' }).then(() => {
        const record = state.connections.records.get(button.dataset.closeConnection);
        if (record) {
          record.status = 'closed';
          record.closedAt = Date.now();
        }
        drawConnections();
      }));
    });
  }

  function connectionHeadersHTML() {
    return visibleConnectionColumns().map(([key, label]) => {
      if (key === 'close') return `<th class="conn-col-${key}">${label}</th>`;
      return `<th class="conn-col-${key}"><button class="connection-sort-button${state.connections.sortKey === key ? ' active' : ''}" data-sort-connection="${key}" type="button">${label}<span>${state.connections.sortKey === key ? (state.connections.sortDir === 'asc' ? '↑' : '↓') : ''}</span></button></th>`;
    }).join('');
  }

  function defaultConnectionSortDir(key) {
    return ['downSpeed', 'upSpeed', 'download', 'upload', 'duration', 'lastSeen'].includes(key) ? 'desc' : 'asc';
  }

  function filteredConnectionRecords(status) {
    const q = String(document.getElementById('connection-filter') && document.getElementById('connection-filter').value || '').toLowerCase();
    const type = state.connections.type || 'all';
    return Array.from(state.connections.records.values())
      .filter(item => item.status === status)
      .filter(item => type === 'all' || connectionType(item.conn).toLowerCase().includes(type))
      .filter(item => !q || JSON.stringify(item.conn).toLowerCase().includes(q) || connectionTarget(item.conn).toLowerCase().includes(q))
      .sort(compareConnectionRecords);
  }

  function compareConnectionRecords(a, b) {
    const key = state.connections.sortKey || 'lastSeen';
    const dir = state.connections.sortDir === 'asc' ? 1 : -1;
    const av = connectionSortValue(a, key);
    const bv = connectionSortValue(b, key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'zh-CN', { numeric: true }) * dir;
  }

  function connectionSortValue(item, key) {
    const conn = item.conn || {};
    const rule = [conn.rule, conn.rulePayload].filter(Boolean).join(' :: ');
    const chains = Array.isArray(conn.chains) ? conn.chains.join(' -> ') : '';
    switch (key) {
    case 'type': return connectionType(conn);
    case 'process': return connectionProcess(conn);
    case 'source': return connectionSource(conn);
    case 'destination': return connectionDestinationIP(conn);
    case 'sniffHost': return connectionSniffHost(conn) || connectionTarget(conn);
    case 'rule': return rule;
    case 'chains': return chains;
    case 'duration': return Date.now() - item.createdAt;
    case 'downSpeed': return item.downSpeed;
    case 'upSpeed': return item.upSpeed;
    case 'download': return item.download;
    case 'upload': return item.upload;
    default: return item.lastSeen || 0;
    }
  }

  function connectionRowHTML(item) {
    return `<tr>${visibleConnectionColumns().map(([key]) => connectionCellHTML(item, key)).join('')}</tr>`;
  }

  function connectionCellHTML(item, key) {
    const conn = item.conn || {};
    const target = connectionTarget(conn);
    const source = connectionSource(conn);
    const destinationIP = connectionDestinationIP(conn);
    const sniffHost = connectionSniffHost(conn);
    const rule = [conn.rule, conn.rulePayload].filter(Boolean).join(' :: ');
    const chains = Array.isArray(conn.chains) ? conn.chains.join(' -> ') : '';
    switch (key) {
    case 'type': return `<td class="conn-col-type">${escapeHTML(connectionType(conn))}</td>`;
    case 'process': return `<td class="conn-col-process">${escapeHTML(connectionProcess(conn))}</td>`;
    case 'source': return `<td class="conn-col-source" title="${escapeHTML(source)}">${escapeHTML(source)}</td>`;
    case 'destination': return `<td class="conn-col-destination" title="${escapeHTML(destinationIP)}">${escapeHTML(destinationIP)}</td>`;
    case 'sniffHost': return `<td class="conn-col-sniffHost" title="${escapeHTML(sniffHost || target)}">${escapeHTML(sniffHost || target)}</td>`;
    case 'rule': return `<td class="conn-col-rule">${escapeHTML(rule || '-')}</td>`;
    case 'chains': return `<td class="conn-col-chains" title="${escapeHTML(chains)}">${escapeHTML(chains || '-')}</td>`;
    case 'duration': return `<td class="conn-col-duration">${escapeHTML(durationText(Date.now() - item.createdAt))}</td>`;
    case 'downSpeed': return `<td class="conn-col-downSpeed rate-down">${rateSize(item.downSpeed)}/s</td>`;
    case 'upSpeed': return `<td class="conn-col-upSpeed rate-up">${rateSize(item.upSpeed)}/s</td>`;
    case 'download': return `<td class="conn-col-download download-total">${size(item.download)}</td>`;
    case 'upload': return `<td class="conn-col-upload upload-total">${size(item.upload)}</td>`;
    case 'close': return `<td class="conn-col-close">${item.status === 'active' ? `<button class="mini danger-mini" data-close-connection="${escapeHTML(item.id)}">关闭</button>` : '-'}</td>`;
    default: return '';
    }
  }

  function connectionType(conn) {
    const meta = conn.metadata || {};
    const kind = meta.type || conn.type || '-';
    const network = meta.netWork || meta.network;
    return network && kind !== network ? `${kind}(${network})` : String(kind || network || '-');
  }

  function connectionProcess(conn) {
    const meta = conn.metadata || {};
    return meta.process || meta.processPath || '-';
  }

  function connectionTarget(conn) {
    const meta = conn.metadata || {};
    const host = meta.host || meta.remoteDestination || meta.destinationIP || meta.dstIP || '';
    const port = meta.destinationPort || meta.dstPort || meta.remoteDestinationPort || '';
    return port ? `${host}:${port}` : String(host || '-');
  }

  function connectionSource(conn) {
    const meta = conn.metadata || {};
    const source = meta.sourceIP || meta.srcIP || meta.sourceAddress || meta.source || '';
    const port = meta.sourcePort || meta.srcPort || '';
    return port ? `${source}:${port}` : String(source || '-');
  }

  function connectionDestinationIP(conn) {
    const meta = conn.metadata || {};
    const destination = meta.destinationIP || meta.dstIP || meta.remoteDestination || '';
    const port = meta.destinationPort || meta.dstPort || meta.remoteDestinationPort || '';
    return port ? `${destination}:${port}` : String(destination || '-');
  }

  function connectionSniffHost(conn) {
    const meta = conn.metadata || {};
    return String(meta.sniffHost || meta.sniffedHost || meta.host || meta.domain || '');
  }

  function connectionStartTime(conn) {
    const started = conn.start || conn.created || conn.createdAt;
    const time = started ? new Date(started).getTime() : 0;
    return Number.isNaN(time) ? 0 : time;
  }

  function durationText(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) return `大约 ${hours} 小时`;
    if (minutes > 0) return `${minutes} 分钟`;
    return `${total} 秒`;
  }

  function logsPage() {
    let source;
    const level = document.getElementById('log-level');
    const view = document.getElementById('logs-view');
    document.getElementById('clear-logs').addEventListener('click', () => { state.logs = []; draw(); });
    document.getElementById('pause-logs').addEventListener('click', event => { state.paused = !state.paused; event.target.textContent = state.paused ? '继续' : '暂停'; });
    document.getElementById('log-filter').addEventListener('input', draw);
    level.addEventListener('change', connect);
    connect();
    function connect() {
      if (source) source.close();
      source = openStream('/logs?level=' + encodeURIComponent(level.value), data => {
        state.logs.push(data);
        if (state.logs.length > 1000) state.logs.shift();
        if (!state.paused) draw();
      });
    }
    function draw() {
      const q = document.getElementById('log-filter').value.toLowerCase();
      view.textContent = state.logs.filter(x => JSON.stringify(x).toLowerCase().includes(q)).map(x => `[${x.time || ''}] ${x.type || x.level || ''} ${x.payload || JSON.stringify(x)}`).join('\n');
      view.scrollTop = view.scrollHeight;
    }
  }

  async function configPage() {
    document.querySelector('[data-refresh="configs"]').addEventListener('click', configPage);
    const form = document.getElementById('config-form');
    const data = await request('/configs').catch(() => ({}));
    bindConfigForm(form, data);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const body = collectConfigForm(form, data);
      await request('/configs', { method: 'PATCH', body: JSON.stringify(body) });
      const latest = await request('/configs').catch(() => null);
      if (latest) bindConfigForm(form, latest);
      alert('已保存');
    });

    renderPanelSettings();

    document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => {
      if (confirm('确认执行此危险操作？')) request(b.dataset.action, { method: b.dataset.method || 'POST', body: b.dataset.body || undefined }).then(() => alert('请求已发送'));
    }));
  }

  function backendsPage() {
    renderPanelSettings();
    const list = document.getElementById('backend-list');
    const form = document.getElementById('backend-manager-form');
    const panel = document.getElementById('backend-editor-panel');
    const toggle = document.getElementById('backend-create-toggle');
    const cancel = document.getElementById('backend-editor-cancel');
    const title = document.getElementById('backend-editor-title');

    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = 'true';
      toggle.addEventListener('click', () => openEditor());
    }
    if (cancel && !cancel.dataset.bound) {
      cancel.dataset.bound = 'true';
      cancel.addEventListener('click', closeEditor);
    }
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', event => {
        event.preventDefault();
        let saved;
        try {
          saved = saveBackend(collectBackendForm(form));
        } catch (_) {
          return;
        }
        activateBackend(saved.id);
        renderList();
        renderBackendStatus();
        closeEditor();
      });
    }

    renderList();
    renderBackendStatus();

    function openEditor(item) {
      if (!panel || !form || !title) return;
      panel.hidden = false;
      title.textContent = item ? '编辑后端' : '新增后端';
      form.reset();
      form.elements.id.value = item && item.id || '';
      form.elements.name.value = item && item.name || '';
      form.elements.url.value = item && item.url || '';
      form.elements.secret.value = item && item.secret || '';
    }

    function closeEditor() {
      if (panel) panel.hidden = true;
      if (form) form.reset();
    }

    function renderList() {
      if (!list) return;
      const items = sortedBackends();
      if (!items.length) {
        list.innerHTML = '<article class="backend-card empty-state"><strong>还没有已保存的后端</strong><p class="muted">新增一个 mihomo external-controller 地址后即可开始使用。</p></article>';
        return;
      }
      list.innerHTML = '';
      items.forEach(item => {
        const card = document.createElement('article');
        const active = isActiveBackend(item.id);
        card.className = 'backend-card' + (active ? ' active' : '');
        card.innerHTML = `<div class="backend-card-head"><div><strong>${escapeHTML(item.name)}</strong><p class="muted backend-card-url">${escapeHTML(item.url)}</p></div><span class="backend-badge">${active ? '已激活' : '待命'}</span></div><div class="backend-card-meta"><span>${item.secret ? '已配置密钥' : '无密钥'}</span><span>${escapeHTML(formatBackendUpdatedAt(item.updatedAt))}</span></div><div class="backend-card-actions"></div>`;
        const actions = card.querySelector('.backend-card-actions');
        const activate = document.createElement('button');
        activate.className = active ? 'primary' : 'ghost action-button';
        activate.type = 'button';
        activate.textContent = active ? '当前使用中' : '激活';
        activate.disabled = cfg.fixedTarget;
        activate.addEventListener('click', () => {
          activateBackend(item.id);
          renderList();
          renderBackendStatus();
        });
        const edit = document.createElement('button');
        edit.className = 'ghost action-button';
        edit.type = 'button';
        edit.textContent = '编辑';
        edit.addEventListener('click', () => openEditor(item));
        const remove = document.createElement('button');
        remove.className = 'ghost action-button';
        remove.type = 'button';
        remove.textContent = '删除';
        remove.disabled = cfg.fixedTarget && active;
        remove.addEventListener('click', () => {
          const warning = active ? `「${item.name}」是当前激活的后端，删除后${state.backendStore.items.length > 1 ? '将自动切换到其他配置' : '需要重新配置后端'}，确认删除？` : `确认删除后端 ${item.name}？`;
          if (!confirm(warning)) return;
          deleteBackend(item.id);
          renderList();
          renderBackendStatus();
        });
        const testButton = document.createElement('button');
        testButton.className = 'ghost action-button backend-test-button';
        testButton.type = 'button';
        testButton.textContent = '测试连接';
        testButton.addEventListener('click', () => testBackend(item, testButton));
        actions.append(activate, edit, remove, testButton);
        list.appendChild(card);
      });
    }
  }

  function bindConfigForm(form, data) {
    Array.from(form.elements).forEach(el => {
      const path = el.dataset.path || el.name;
      if (!path) return;
      const value = getFieldValue(data, el);
      if (value === undefined) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else if (el.tagName === 'SELECT') el.value = normalizeSelectValue(el, value);
      else el.value = value;
    });
  }

  function collectConfigForm(form, currentData) {
    const body = {};
    Array.from(form.elements).forEach(el => {
      const path = el.dataset.path || el.name;
      if (!path) return;
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'number') {
        if (el.value === '') return;
        value = Number(el.value);
      } else {
        if (el.value === '') return;
        value = el.value;
      }
      setValueAtPath(body, path, value);
    });
    if (body['allow-lan'] === true) {
      const bindAddress = getValueAtPath(currentData || {}, 'bind-address');
      if (!bindAddress || bindAddress === '127.0.0.1' || bindAddress === '::1' || bindAddress === 'localhost') {
        body['bind-address'] = '*';
      }
    }
    return body;
  }

  function getFieldValue(data, el) {
    const path = el.dataset.path || el.name;
    const fallbackPaths = String(el.dataset.fallbackPaths || '').split(',').map(x => x.trim()).filter(Boolean);
    const paths = [path].concat(fallbackPaths);
    for (const item of paths) {
      const value = getValueAtPath(data, item);
      if (value !== undefined) return normalizeFieldValue(el, item, value);
    }
    return undefined;
  }

  function normalizeFieldValue(el, path, value) {
    if (el.type === 'checkbox' && path === 'sniffing' && Array.isArray(value)) return value.length > 0;
    return value;
  }

  function normalizeSelectValue(el, value) {
    const normalized = String(value).toLowerCase();
    const options = Array.from(el.options || []);
    const match = options.find(option => String(option.value).toLowerCase() === normalized);
    return match ? match.value : value;
  }

  function getValueAtPath(obj, path) {
    return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  function setValueAtPath(obj, path, value) {
    const keys = String(path).split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') current[key] = {};
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  }

  function renderPanelSettings() {
    const language = document.getElementById('panel-language');
    const styleRoot = document.getElementById('chart-style-picker');
    if (language) language.value = 'zh-CN';
    applyChartStyle(state.chartStyle);
    renderBackendStatus();
    if (styleRoot) {
      styleRoot.querySelectorAll('[data-chart-style]').forEach(button => {
        button.classList.toggle('active', button.dataset.chartStyle === state.chartStyle);
        button.addEventListener('click', () => {
          applyChartStyle(button.dataset.chartStyle);
          styleRoot.querySelectorAll('[data-chart-style]').forEach(el => el.classList.toggle('active', el === button));
        });
      });
    }
  }

  function renderBackendStatus() {
    const current = document.getElementById('backend-current');
    const mode = document.getElementById('backend-mode');
    const active = getActiveBackend();
    if (current) current.textContent = state.targetURL || '未设置';
    if (!mode) return;
    if (cfg.fixedTarget) {
      mode.textContent = '当前使用启动参数指定的 mihomo 后端；本地激活配置不会覆盖它。';
      return;
    }
    if (active) {
      mode.textContent = `当前使用本地激活配置：${active.name}`;
      return;
    }
    mode.textContent = '尚未激活 mihomo 后端，请先在后端管理页新增并激活一个配置。';
  }

  async function aboutPage() {
    const data = await request('/version').catch(err => ({ error: String(err) }));
    const jsonEl = document.getElementById('mihomo-version');
    if (jsonEl) jsonEl.textContent = JSON.stringify(data, null, 2);
    const coreEl = document.getElementById('mihomo-core-version');
    if (coreEl && data && data.version) coreEl.textContent = String(data.version).replace(/^mihomo\s*/i, '');
  }

  function openStream(path, onData) {
    if (!state.targetURL) return { close() {} };
    const url = streamURL(path);
    const socket = new WebSocket(url);
    socket.onmessage = event => {
      String(event.data).split('\n').filter(Boolean).forEach(line => {
        try { onData(JSON.parse(line)); } catch (_) {}
      });
    };
    return socket;
  }

  function streamURL(path) {
    const base = new URL(apiURL(path));
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    if (state.targetSecret) base.searchParams.set('token', state.targetSecret);
    return base.toString();
  }

  function size(n) {
    n = Number(n || 0);
    if (n >= 1024 * 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024 / 1024).toFixed(2) + ' TiB';
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MiB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB';
    return n + ' B';
  }

  function rateSize(n) {
    n = Number(n || 0);
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MiB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KiB';
    return n.toFixed(1) + ' B';
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
})();
