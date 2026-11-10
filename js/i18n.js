/* ------------------------------------------------------------------
 * 中英文案
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var DICT = {
    zh: {
      'doc.title': 'CRAFTS 条带天区查询 · FAST 19 波束漂移扫描',
      'brand.title': 'FAST 19 波束漂移扫描同时巡天<br>覆盖可视化',
      'brand.sub': '19 波束漂移扫描巡天覆盖可视化',
      'label.query': '条带编号',
      'ph.query': 'Dec-0409 / +2820 / #117',
      'btn.locate': '定位',
      'hint.query': 'Dec±DDMM · 条带全名 · #序号 0–221',
      'label.frame': '坐标系',
      'seg.eq': '赤道坐标',
      'seg.gal': '银道坐标',
      'label.layers': '图层',
      'chip.plan': '计划条带',
      'chip.observed': '已搜索条带',
      'chip.atnf': 'ATNF 脉冲星',
      'chip.crafts': 'CRAFTS 脉冲星',
      'chip.milky': '银道面',
      'chip.grid': '坐标网格',
      'chip.labels': '坐标标注',
      'chip.za': 'ZA 界限',
      'chip.zenith': 'FAST 天顶',
      'label.searched': '已搜索条带',
      'unit.strips': '条',
      'sort.desc': '高→低',
      'sort.asc': '低→高',
      'sort.title': '按赤纬排序',
      'label.plan': '计划条带',
      'label.detail': '条带详情',
      'info.empty': '在图上悬停，或输入条带编号后定位',
      'foot.plan': '计划条带 222 条 · Dec −13.9° ~ +65.9°',
      'foot.src': '数据来源于CRAFTS 官网',
      'foot.sync.on': '腾讯文档同步于',
      'foot.sync.none': '尚未同步腾讯文档',
      'title.refresh': '从腾讯文档刷新数据',
      'sync.syncing': '正在同步腾讯文档…',
      'sync.failed': '同步失败，仍显示上次数据',
      'sync.noServer': '同步服务未启动（需先运行 scripts/serve.py）',
      'sync.reloading': '正在获取最新数据…',
      'sync.uptodate': '已是最新数据',
      'stage.eq': '赤道坐标 · Mollweide',
      'stage.gal': '银道坐标 · Mollweide',
      'legend.plan': '计划覆盖',
      'legend.searched': '已搜索',
      'legend.current': '当前条带',
      'legend.atnf': 'ATNF 脉冲星',
      'legend.crafts': 'CRAFTS 脉冲星',
      'hint.keys': '滚轮缩放 · 拖拽平移 · 双击复位 · Esc 取消',
      'tip.project': '项目编号',
      'tip.strip': '条带编号',
      'tip.date': '观测日期',
      'tip.dec': '赤纬',
      'tip.ra': '赤经窗口',
      'tip.beams': '波束',
      'tip.status': '状态',
      'tip.index': '条带序号',
      'tip.coverage': '覆盖',
      'tip.decRange': '赤纬范围',
      'tip.progress': '波束进度',
      'x.searched': '已搜索',
      'status.done': '已完成',
      'status.partial': '部分完成',
      'status.running': '正在搜索',
      'status.idle': '未开始',
      'note.click': '点击固定查看',
      'note.plan': 'CRAFTS 计划 Dec 条带',
      'plan.fullRA': '全赤经 0h – 24h',
      'plan.fullRA2': '全赤经（计划）',
      'plan.unobserved': '未观测',
      'tag.searched': '已搜索条带',
      'tag.plan': 'CRAFTS 计划条带',
      'err.notfound': '没找到对应条带，试试 Dec-0409、+2820 或 #117',
      'canvas.galCenter': '银心 l=0°',
      'canvas.zenith': 'FAST 天顶',
      'zenith.title': 'FAST 天顶',
      'zenith.note': '站址正上方：赤纬 = 纬度 +25.65°，赤经 = 当地恒星时',
      'zenith.tag': '望远镜指向',
      'title.zoomIn': '放大',
      'title.zoomOut': '缩小',
      'title.reset': '复位视图',
      'btn.reset': '复位'
    },
    en: {
      'doc.title': 'CRAFTS Strip Sky Coverage · FAST 19-beam drift scan',
      'brand.title': 'FAST 19-beam simultaneous<br>drift-scan coverage',
      'brand.sub': 'FAST 19-beam drift-scan survey footprint',
      'label.query': 'Strip ID',
      'ph.query': 'Dec-0409 / +2820 / #117',
      'btn.locate': 'Locate',
      'hint.query': 'Dec±DDMM · full strip ID · #index 0–221',
      'label.frame': 'Coordinates',
      'seg.eq': 'Equatorial',
      'seg.gal': 'Galactic',
      'label.layers': 'Layers',
      'chip.plan': 'Planned strips',
      'chip.observed': 'Searched strips',
      'chip.atnf': 'ATNF pulsars',
      'chip.crafts': 'CRAFTS pulsars',
      'chip.milky': 'Galactic plane',
      'chip.grid': 'Grid',
      'chip.labels': 'Axis labels',
      'chip.za': 'ZA limits',
      'chip.zenith': 'FAST zenith',
      'label.searched': 'Searched strips',
      'unit.strips': 'strips',
      'sort.desc': 'High→Low',
      'sort.asc': 'Low→High',
      'sort.title': 'Sort by declination',
      'label.plan': 'Planned strip',
      'label.detail': 'Strip details',
      'info.empty': 'Hover a strip on the map, or enter a strip ID',
      'foot.plan': '222 planned strips · Dec −13.9° ~ +65.9°',
      'foot.src': 'Data source: CRAFTS official website',
      'foot.sync.on': 'Tencent Docs synced at',
      'foot.sync.none': 'Not synced with Tencent Docs',
      'title.refresh': 'Refresh from Tencent Docs',
      'sync.syncing': 'Syncing from Tencent Docs…',
      'sync.failed': 'Sync failed, showing last data',
      'sync.noServer': 'Sync service not running (start scripts/serve.py)',
      'sync.reloading': 'Fetching latest data…',
      'sync.uptodate': 'Already up to date',
      'stage.eq': 'Equatorial · Mollweide',
      'stage.gal': 'Galactic · Mollweide',
      'legend.plan': 'Planned coverage',
      'legend.searched': 'Searched',
      'legend.current': 'Active strip',
      'legend.atnf': 'ATNF pulsars',
      'legend.crafts': 'CRAFTS pulsars',
      'hint.keys': 'Scroll to zoom · drag to pan · double-click to reset · Esc to clear',
      'tip.project': 'Project ID',
      'tip.strip': 'Strip ID',
      'tip.date': 'Obs. date',
      'tip.dec': 'Dec',
      'tip.ra': 'RA window',
      'tip.beams': 'Beams',
      'tip.status': 'Status',
      'tip.index': 'Strip index',
      'tip.coverage': 'Coverage',
      'tip.decRange': 'Dec range',
      'tip.progress': 'Beam progress',
      'x.searched': 'searched',
      'status.done': 'Completed',
      'status.partial': 'Partial',
      'status.running': 'Searching',
      'status.idle': 'Not started',
      'note.click': 'click to pin',
      'note.plan': 'Planned CRAFTS Dec strip',
      'plan.fullRA': 'Full RA 0h – 24h',
      'plan.fullRA2': 'Full RA (planned)',
      'plan.unobserved': 'Not observed',
      'tag.searched': 'Searched strip',
      'tag.plan': 'Planned CRAFTS strip',
      'err.notfound': 'No match. Try Dec-0409, +2820 or #117',
      'canvas.galCenter': 'Galactic centre l=0°',
      'canvas.zenith': 'FAST zenith',
      'zenith.title': 'FAST zenith',
      'zenith.note': 'directly overhead: Dec = site latitude +25.65°, RA = local sidereal time',
      'zenith.tag': 'Telescope pointing',
      'title.zoomIn': 'Zoom in',
      'title.zoomOut': 'Zoom out',
      'title.reset': 'Reset view',
      'btn.reset': 'Reset'
    }
  };

  var lang = 'zh';
  try {
    var saved = localStorage.getItem('crafts-lang');
    if (saved === 'en' || saved === 'zh') lang = saved;
  } catch (e) { /* file:// 下可能不可用 */ }

  function t(key) {
    var d = DICT[lang] || DICT.zh;
    return d[key] != null ? d[key] : (DICT.zh[key] != null ? DICT.zh[key] : key);
  }

  function apply() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('doc.title');

    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var htm = document.querySelectorAll('[data-i18n-html]');
    for (var h = 0; h < htm.length; h++) {
      htm[h].innerHTML = t(htm[h].getAttribute('data-i18n-html'));
    }
    var phs = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) {
      phs[j].setAttribute('placeholder', t(phs[j].getAttribute('data-i18n-ph')));
    }
    var tts = document.querySelectorAll('[data-i18n-title]');
    for (var m = 0; m < tts.length; m++) {
      tts[m].setAttribute('title', t(tts[m].getAttribute('data-i18n-title')));
    }
    var btns = document.querySelectorAll('#lang [data-lang]');
    for (var k = 0; k < btns.length; k++) {
      btns[k].classList.toggle('active', btns[k].getAttribute('data-lang') === lang);
    }
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function set(next) {
    if (next !== 'zh' && next !== 'en') return;
    lang = next;
    try { localStorage.setItem('crafts-lang', lang); } catch (e) {}
    apply();
  }

  global.I18N = {
    t: t,
    apply: apply,
    set: set,
    get lang() { return lang; }
  };
})(window);
