/*
  문진 대기 모니터 **사본** — 키오스크 두 곳이 같이 쓴다(2026-10-15).

    · pages/desk-kiosk.html          문진 새 창이 열린 동안 키오스크 본창
    · pages/desk-kiosk-monitor.html  #/desk/kiosk 의 iframe (키오스크는 새 전체 창으로 뜬다)

  🔴 원본 `#/intake/reception-monitor`(legacy-runtime `rmRender`)를 **복사**했다(사용자 지시 —
     「그대로 쓰지 말고 copy 해서」). 원본을 고쳐도 이쪽은 바뀌지 않는다. **QR 은 뺐다.**
     규칙은 원본과 같다: 대기 = 미접수·미완료, 진료 중 = 접수·미완료, 각 12명 + 「외 N명」,
     이름 가림(공개 화면 — 박*영).
  🔴 두 화면이 **이 파일 하나**를 쓴다 — 복사본을 또 복사하면 한쪽만 고쳐진다.
  ⚠️ 원본은 셸의 tailwind 클래스를 쓰는데 이 문서들엔 tailwind 가 없어 같은 값을 평문 CSS 로 옮겼다.
  ⚠️ 데이터는 api-v1(`/api-v1/data/api/intake/reception-queue`) — 원본 모양 그대로(봉투 없음, `j.items`).
     실패를 「0명」으로 그리지 않는다(덴트웹이 꺼지면 502).
*/
(function () {
  'use strict'
  const CSS = `
  .rm-wrap{min-height:100%;background:#f9fafb;padding:24px;font:14px Pretendard,system-ui,sans-serif}
  .rm-row{display:flex;align-items:center;justify-content:space-between}
  .rm-clinic{font-size:20px;font-weight:800;color:#111827}
  .rm-date{font-size:16px;font-weight:600;color:#6b7280}
  .rm-h1{margin:8px 0 0;font-size:30px;font-weight:800;color:#111827}
  .rm-badge{border-radius:12px;border:2px solid #fcd34d;background:#fffbeb;padding:8px 16px;
    font-size:18px;font-weight:800;color:#b45309}
  .rm-h2{margin:24px 0 12px;font-size:24px;font-weight:800;color:#111827}
  .rm-grid{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}
  .rm-card{border-radius:12px;border:2px solid #fcd34d;background:#fff;padding:12px 16px}
  .rm-card.prog{border-color:#6ee7b7}
  .rm-name{font-size:18px;font-weight:800;color:#111827}
  .rm-name span{color:#6b7280;font-weight:400}
  .rm-time{margin-top:4px;font-size:14px;color:#6b7280}
  .rm-more{margin-top:12px;display:inline-block;border-radius:12px;border:2px solid #fcd34d;
    color:#b45309;background:#fff;padding:8px 16px;font-size:16px;font-weight:700}
  .rm-more.prog{border-color:#6ee7b7;color:#047857}
  .rm-empty{padding:24px;color:#6b7280;font-size:15px}`
  function injectCss() {
    if (document.getElementById('rm-css')) return
    const s = document.createElement('style'); s.id = 'rm-css'; s.textContent = CSS
    document.head.appendChild(s)
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  function mask(n) { n = String(n || ''); if (n.length <= 1) return n; if (n.length === 2) return n[0] + '*'; return n[0] + '*' + n.slice(2) }
  function hm(iso) {
    const m = String(iso || '').match(/T(\d{2}):(\d{2})/); if (!m) return ''
    const h = +m[1]; return (h < 12 ? '오전' : '오후') + ' ' + ((h % 12) || 12) + ':' + m[2]
  }
  const kstNow = () => new Date(Date.now() + 9 * 3600e3)
  const kstDay = () => kstNow().toISOString().slice(0, 10)
  function card(rec, kind) {
    const gv = (rec.gender && rec.gender !== '-') ? rec.gender : ''
    const g = gv ? ' <span>(' + esc(gv) + ')</span>' : ''
    return '<div class="rm-card' + (kind === 'prog' ? ' prog' : '') + '"><div class="rm-name">' + esc(mask(rec.patientName)) + g +
      '</div><div class="rm-time">' + esc(hm(rec.intakeAt)) + '</div></div>'
  }
  function render(el, items, clinic) {
    injectCss()
    const wait = items.filter(x => !x.received && !x.completed)
    const prog = items.filter(x => x.received && !x.completed)
    const CAP = 12
    const section = (title, list, kind, moreWord) => {
      let h = '<h2 class="rm-h2">' + title + '</h2><div class="rm-grid">' + list.slice(0, CAP).map(r => card(r, kind)).join('') + '</div>'
      if (list.length > CAP) h += '<div class="rm-more' + (kind === 'prog' ? ' prog' : '') + '">외 ' + (list.length - CAP) + '명 ' + moreWord + '</div>'
      return h
    }
    const n = kstNow(), H = n.getUTCHours()
    const dateStr = n.getUTCFullYear() + '년 ' + (n.getUTCMonth() + 1) + '월 ' + n.getUTCDate() + '일 ' +
      (H < 12 ? '오전' : '오후') + ' ' + ((H % 12) || 12) + ':' + String(n.getUTCMinutes()).padStart(2, '0')
    // ⚠️ 원본은 치과 이름을 코드에 박았다 — 사본은 **덴트웹에서 읽은 이름**을 받는다.
    el.innerHTML = '<div class="rm-wrap">' +
      '<div class="rm-row"><div class="rm-clinic">' + esc(clinic || '') + '</div><div class="rm-date">' + dateStr + '</div></div>' +
      '<div class="rm-row"><h1 class="rm-h1">접수 대기 현황</h1><span class="rm-badge">대기 ' + wait.length + '명</span></div>' +
      section('진료 대기', wait, 'wait', '대기중') +
      section('진료 중', prog, 'prog', '진료중') +
      '</div>'
  }
  /* alive() 가 false 면(그새 닫힘) 그리지 않는다. */
  async function load(el, clinic, alive) {
    alive = alive || (() => true)
    try {
      const r = await fetch(location.origin + '/api-v1/data/api/intake/reception-queue?date=' + kstDay())
      const j = await r.json()
      if (!alive()) return
      if (!r.ok || !j || !Array.isArray(j.items)) throw new Error((j && (j.error || j.message)) || ('HTTP ' + r.status))
      render(el, j.items, typeof clinic === 'function' ? clinic() : clinic)
    } catch (e) {
      if (!alive()) return
      injectCss()
      el.innerHTML = '<div class="rm-empty">대기 현황을 불러오지 못했습니다</div>'
      console.log('[kiosk] 대기 현황 실패', String(e && e.message || e))
    }
  }
  window.KioskMonitor = { render, load, kstDay }
})()
