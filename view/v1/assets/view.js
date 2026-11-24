/* 뷰어통합 — **원본 구조에 맞춘** 얇은 껍데기 + 해시 라우팅.
 *
 * 🔴 **왜 다시 썼나**(2026-10-13)
 *    예전엔 우리 껍데기(`#vvMain`·사이드바·상단 바)를 따로 세웠다. 그런데 원본
 *    런타임은 `document.querySelector('main')` 에 그리고, 화면마다 **그 안을 통째로
 *    갈아끼운다.** 둘이 같은 DOM 을 두고 다퉈 **레포트 화면이 비고** 토글이 사라졌다.
 *    → 실사이트 DOM 을 측정해(docs/.../06_원본DOM구조.md) `main.h-full` 하나로 맞췄다.
 *
 * 🔴 **헤더·좌측 탭은 만들지 않는다**(사용자 지시). 토글만 `main` **바깥**에 띄운다.
 * 🔴 **빌드 단계가 없다.** 파일을 고치고 새로고침하면 끝이다.
 */
'use strict'

/* ═══ 로그인 세션 — Bearer 토큰 자동 첨부 (2026-10-19) ═══
 *
 * 🔴 **왜**: 쿠키가 막히는 환경(CORS·시크릿·쿠키 차단)에서 세션이 안 붙어 로그인이
 *    유지되지 않았다. 로그인 화면이 응답의 토큰을 `localStorage['mw_token']` 에 저장하므로,
 *    **모든 API 호출에 `Authorization: Bearer` 를 자동으로 붙인다.** 쿠키가 되면 쿠키를,
 *    안 되면 이 헤더를 — 둘 중 하나만 통하면 로그인이 유지된다.
 * 🔴 **401 이면 로그인 화면으로 보낸다.** 세션이 없거나 만료된 것이다. 화면 HTML 은 게이트를
 *    통과하지만(환자 정보 없음), 그 안의 **API 가 401** 이면 여기서 `/login` 으로 돌린다.
 * ⚠️ **같은 출처의 `/api` 계열에만** 붙인다 — 외부(mediqr 등)·화면·자산에는 안 붙인다.
 */
;(function installAuthFetch() {
  let token = ''
  try { token = localStorage.getItem('mw_token') || '' } catch (_) {}
  const orig = window.fetch
  const isApi = (u) => {
    try {
      const url = new URL(u, location.href)
      if (url.origin !== location.origin) return false
      return /^\/(api|api-v0|api-v1|api-v3)\//.test(url.pathname)
    } catch (_) { return false }
  }
  let redirecting = false
  function toLogin() {
    if (redirecting) return
    redirecting = true
    const from = location.pathname + location.search + location.hash
    location.replace('/login?from=' + encodeURIComponent(from))
  }
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (token && isApi(url)) {
      init = init || {}
      const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {})
      if (!h.has('authorization')) h.set('authorization', 'Bearer ' + token)
      init.headers = h
      if (!init.credentials) init.credentials = 'same-origin'
    }
    const r = await orig.call(this, input, init)
    /* 🔴 세션 만료·없음 — 로그인으로. 단 **로그인 수단 자체**(auth·staff-list)는 제외
       (그건 로그인 전에 부르므로 401 이 정상 흐름일 수 있다). */
    if (r && r.status === 401 && isApi(url) && !/\/api\/auth\//.test(url)) {
      toLogin()
    }
    return r
  }
})()

const BASE = '/view-v1'
const $ = (id) => document.getElementById(id)

/* 자산 캐시 깨기 — `no-store` 를 걸어도 **이미 받아 둔 사본**은 그대로 쓰인다.
 * 🔴 값은 **빌드 시각**(YYYYMMDDHHmm). 숫자 카운터는 올리는 걸 잊으면 조용히
 *    옛 코드가 돈다(실제로 그래서 헤맸다). `scripts/stamp-view-v1.mjs` 가 찍는다. */
const ASSET_V =
  new URL(document.currentScript?.src || location.href, location.href).searchParams.get('v') ||
  new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
const v = (u) => u + (u.includes('?') ? '&' : '?') + 'v=' + ASSET_V

/* ═══ 모드 전환 중 표시 (2026-10-14 사용자 지시) ═══
 *
 * 🔴 **왜 필요한가** — 토글을 눌러도 화면이 바뀌는지 알 수 없었다. 실측해 보니
 *    전환은 되는데 ① 데이터를 다시 받는 경로는 수백 ms~수초가 걸리고 ② 그 동안
 *    **아무 표시가 없어** 눌린 건지 고장인지 구분이 안 됐다.
 *
 * 🔴 **모든 페이지에 걸린다.** 화면마다 따로 붙이면 빠진 화면이 생긴다 —
 *    토글 클릭 한 곳에서 켜고, 그리기가 끝나면 끈다.
 * ⚠️ `main` 안에 넣지 않는다. 원본 런타임이 `main` 을 통째로 갈아끼우므로
 *    그 안에 두면 **덮어쓰기와 동시에 사라진다**(표시가 깜빡이고 만다).
 *    `body` 에 고정으로 띄운다.
 * ⚠️ 최소 표시 시간을 둔다. 캐시가 있어 50ms 만에 끝나면 **깜빡임만 보여**
 *    오히려 고장처럼 읽힌다 — 350ms 는 눈이 「바뀌는 중」으로 인식하는 하한이다.
 */
const BUSY_MIN_MS = 350
let busyT0 = 0

function busyOn(label) {
  busyT0 = performance.now()
  let el = $('vvBusy')
  if (!el) {
    el = document.createElement('div')
    el.id = 'vvBusy'
    document.body.appendChild(el)
  }
  // 🔴 카드(.vvb-tx)가 없으면 **다시 깐다.** 빈 #vvBusy 가 남아 있으면
  //    querySelector('.vvb-tx') 가 null 이라 textContent 에서 터진다.
  if (!el.querySelector('.vvb-tx')) {
    el.innerHTML =
      '<div class="vvb-card"><span class="vvb-spin" aria-hidden="true"></span>' +
      '<span class="vvb-tx"></span></div>'
  }
  el.querySelector('.vvb-tx').textContent = label || '불러오는 중…'
  el.setAttribute('data-on', '1')
  // 스크린리더에도 알린다 — 시각 효과만으로는 못 읽는 사용자가 있다.
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
}

function busyOff() {
  const el = $('vvBusy')
  if (!el) return
  const left = Math.max(0, BUSY_MIN_MS - (performance.now() - busyT0))
  setTimeout(() => { el.removeAttribute('data-on') }, left)
}

/** 그리기가 끝나고 **조회까지 다 받은 뒤** 표시를 끈다.
 *
 * 🔴 `applyMode()` 는 동기로 끝나지만 그 안의 조회는 비동기다. 그것만 보고 끄면
 *    **아직 빈 화면인데 표시가 사라진다** — 바로 그게 「바뀐 건지 모르겠다」의 원인이다.
 * ⚠️ 끝까지 안 끝나는 경우에 대비해 **상한**을 둔다. 네트워크가 죽으면 표시가
 *    영영 남는데, 그건 고장으로 읽힌다. 8초면 느린 LAN 도 충분하다.
 */
const BUSY_MAX_MS = 8000
function busyOffWhenIdle() {
  const started = performance.now()
  const inflight = () =>
    (typeof window.__mqInflight === 'function' ? window.__mqInflight() : 0)
  // 조회가 **시작되기 전**에 물어볼 수 있다(그리기 직후). 한 틱 기다렸다 센다.
  setTimeout(function tick() {
    if (inflight() === 0 || performance.now() - started > BUSY_MAX_MS) {
      busyOff()
      return
    }
    setTimeout(tick, 80)
  }, 60)
}


/* ── 데이터 레인 — 실데이터(외부) vs 개발데이터(덴트웹) ──────────────────────
 *   live → /api-v0/...       외부(mediqr.io) 중계
 *   dev  → /api-v1/data/...  덴트웹 DB (하나씩 채워 간다)
 *
 * 🔴 모드의 **주인은 원본 런타임**이다(`getMode`/`setMode`). 우리가 따로 두면
 *    두 벌이 어긋나 「토글은 개발인데 데이터는 실데이터」가 된다.
 */
const MODE_KEY = 'mq-data-mode'
const MODES = [['live', '실데이터(외부)'], ['dev', '개발데이터']]
function getMode() {
  if (typeof window.__mqGetMode === 'function') return window.__mqGetMode()
  try { return localStorage.getItem(MODE_KEY) === 'dev' ? 'dev' : 'live' } catch { return 'live' }
}
function setMode(m) {
  if (typeof window.__mqSetMode === 'function') { window.__mqSetMode(m); return }
  try { localStorage.setItem(MODE_KEY, m) } catch {}
}
function laneBase() {
  return location.origin + (getMode() === 'dev' ? '/api-v1/data' : '/api-v0')
}

async function text(url) {
  const r = await fetch(v(url), { cache: 'no-cache' })
  if (!r.ok) throw new Error(`${url} → ${r.status}`)
  return r.text()
}

async function json(url) {
  const r = await fetch(v(url), { cache: 'no-cache' })
  if (!r.ok) throw new Error(`${url} → ${r.status}`)
  return r.json()
}

/** 지금 경로 — `#/admin/x` → `/admin/x`. 없으면 `/home`. */
function route() {
  let h = location.hash.replace(/^#/, '')
  try { h = decodeURIComponent(h) } catch { /* 반쯤 깨진 인코딩은 원문 그대로 */ }
  return h && h.startsWith('/') ? h : '/home'
}

/** 원본 런타임(약 300KB)을 한 번만 싣는다. `window.MQ` 가 **먼저** 있어야 한다. */
let runtimeLoaded = null
function loadRuntime() {
  if (runtimeLoaded) return runtimeLoaded
  runtimeLoaded = new Promise((res) => {
    const el = document.createElement('script')
    el.src = v(`${BASE}/assets/legacy-runtime.js`)
    // ⚠️ 실패해도 화면은 떠야 한다 — 캡처 상태로라도 보이는 게 빈 화면보다 낫다.
    el.onload = () => res(true)
    el.onerror = () => { console.warn('[view-v1] 런타임 로드 실패 — 캡처 화면 유지'); res(false) }
    document.head.appendChild(el)
  })
  return runtimeLoaded
}

/** 토글 — 🔴 **헤더 우측**에 둔다(사용자 지시 2026-10-13).
 *
 * ⚠️ 헤더는 원본 껍데기(`parts/shell.html`)의 일부라 **화면을 옮기면 통째로 새로
 *    깔릴 수 있다.** 그래서 매 렌더마다 「없으면 다시 꽂는다」로 둔다 —
 *    한 번만 꽂으면 조용히 사라진다(실제로 그래서 토글이 없어졌다).
 */
function buildToggle() {
  /* 🔴 **밸런스치과 로고를 감추고 `=`(햄버거) 옆에 토글을 둔다**(사용자 지시 2026-10-20).
     로고는 shell 의 `.logo` — 지우지 않고 숨긴다(지우면 shell 스크립트가 터질 수 있다). */
  document.querySelectorAll('.side-nav .logo, header .logo, .logo.px-6').forEach((l) => { l.style.display = 'none' })

  /* 🔴 토글은 **사이드바 머리**(.side-nav-header, `=` 버튼 옆)에 둔다(사용자 지시 2026-10-20) —
     상단 톱바는 제거되므로 거기 두면 사라진다. 머리가 아직 없으면(런타임 전) 조용히 기다린다. */
  const snHead = document.querySelector('.side-nav-header')
  let host = $('vvMode')
  if (!host) {
    if (!snHead) return
    host = document.createElement('div')
    host.id = 'vvMode'
    host.className = 'vv-modes'
    snHead.appendChild(host)   // `=` 버튼 **다음**(오른쪽)
  } else if (snHead && host.parentElement !== snHead) {
    snHead.appendChild(host)   // 옛 위치(톱바)에 남아 있으면 사이드바 머리로 옮긴다
  }
  /* 🔴 `.vv-modes` 는 옛 톱바용 CSS 에 margin-right:12px 가 있다 — 사이드바에선 우측에 붙인다.
     margin-left:auto 로 `=` 는 왼쪽(메뉴 아이콘 줄)·토글은 **우측 끝**으로 민다(사용자 지시 2026-10-20). */
  host.style.marginRight = '0'
  host.style.marginLeft = 'auto'
  /* 🔴 사이드바 머리(.side-nav-header)는 **`<a href="/home">`** 이다 — 토글 클릭이 그 링크까지 올라가
     **어느 화면에서 눌러도 대시보드로 튕겼다**(실측 2026-10-21: 동의서 리스트에서 개발데이터 → #/home).
     사용자에겐 「토글했더니 다른 목록이 나온다」로 보였다. 토글 영역에서 링크 기본 동작을 끊는다. */
  if (!host.__noNav) {
    host.__noNav = 1
    host.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation() })
  }
  /* 🔴 **사이드바가 펼쳐졌을 때만** 토글을 보여 준다(사용자 지시 2026-10-20).
     접힌 상태에선 **표시만 안 한다** — 모드 값은 그대로라 api-v1 렌더링은 계속된다. */
  const collapsed = (() => {
    const sn = document.querySelector('.side-nav')
    return sn ? sn.classList.contains('mq-side-collapsed') : false
  })()
  host.style.display = collapsed ? 'none' : ''
  const cur = getMode()
  host.innerHTML = MODES.map(([m, label]) =>
    `<button class="vv-mode${m === cur ? ' on' : ''}" data-mode="${m}">${label}</button>`).join('')
  host.querySelectorAll('button[data-mode]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.mode === getMode()) return
      setMode(b.dataset.mode)
      buildToggle()
      window.MQ_BASE = laneBase()
      // 🔴 **누르자마자** 표시를 켠다. 아래 그리기가 동기로 끝나는 경로도 있어
      //    끝나고 켜면 영영 안 보인다.
      const label = b.textContent.trim()
      busyOn(label + '(으)로 바꾸는 중…')
      // 🔴 `applyMode()` 를 쓴다 — 캡처 원본으로 되돌린 뒤 다시 바인딩해
      //    **양방향 전환이 모두** 동작한다. `bindData` 만 부르면 live 복귀에서 안 받는다.
      // ⚠️ 그리기를 **다음 프레임으로 미룬다.** 같은 틱에서 돌리면 브라우저가
      //    오버레이를 칠할 틈이 없어 화면이 멈춘 뒤 바로 결과만 뜬다.
      requestAnimationFrame(() => setTimeout(() => {
        try {
          if (typeof window.__mqApplyMode === 'function') window.__mqApplyMode()
          else render()
        } catch (e) {
          console.warn('[view-v1] 모드 적용 실패:', e)
        } finally {
          // ⚠️ 실패해도 **반드시** 끈다 — 안 끄면 화면이 영원히 「불러오는 중」이다.
          //    다만 **조회가 끝날 때까지** 기다린다(그려 놓고 빈 화면일 수 있다).
          busyOffWhenIdle()
        }
      }, 0))
    }
  })
}
/* 🔴 사이드바 접힘/펼침이 바뀔 때 런타임(legacy-runtime.js)이 토글을 다시 그리게 노출한다. */
window.__vvBuildToggle = buildToggle

let INDEX = null

/** 한 화면 그리기 — 🔴 **원본 `show()` 에 맡긴다.**
 *
 * 예전엔 `main.innerHTML = screen.main` 으로 직접 깔았다. 그런데 캡처 HTML 이
 * **이미 `<main>` 을 품고 있어** `main` 안에 `main` 이 생기고, 런타임의 `setMain`
 * 이 바깥을 갈아끼우면서 **런타임이 기대하는 자리가 끊겼다** —
 * 그래서 레포트·홈이 비었다(2026-10-13 실측).
 *
 * `show(route)` 하나가 캡처 깔기·제목·차트 화면 분기·`bindData` 까지 전부 한다.
 * 우리가 할 일은 **그 화면의 캡처를 `MQ.screens` 에 미리 넣어 주는 것**뿐이다.
 */
async function render() {
  const path = route()

  if (path === '/home') {
    await loadRuntime()
    const main = document.querySelector('main')
    if (main) {
      main.innerHTML = `<iframe src="/view-v1/pages/morning-small.html"
        style="width:100%;height:100%;border:none;min-height:600px;" title="오늘 현황"></iframe>`
    }
    if (!document.querySelector('.vv-mode')) buildToggle()
    return
  }

  if (path === '/phone-call-view') {
    let missedCount = 0
    try {
      const r = await fetch('/api-v1/missed-call-count', {headers:{accept:'application/json'}, cache:'no-store'})
      if (r.ok) { const d = await r.json(); missedCount = d.count ?? 0 }
    } catch(_) {}

    if (missedCount === 0) {
      await loadRuntime()
      const main = document.querySelector('main')
      if (main) {
        main.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;font-family:'Apple SD Gothic Neo',sans-serif">
          <span style="display:inline-flex;align-items:center;gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:12px 20px;font-size:14px;color:#6b7280">
            ☎ 미수신 0건 — 현재 처리할 항목이 없어요
          </span>
          <a href="#/phone-call-view/outbound" style="font-size:13px;color:#2a85ff;text-decoration:none">발신 목록 보기 →</a>
        </div>`
      }
      if (!document.querySelector('.vv-mode')) buildToggle()
      return
    }
  }

  if (!INDEX) INDEX = await json(`${BASE}/screens/_index.json`)
  const hit = INDEX.find((s) => s.path === path)

  // 캡처를 런타임 저장소에 올린다(한 화면만 — 38개를 다 들고 있지 않는다).
  //
  // 🔴 **빈 캡처는 올리지 않는다.** 차트 화면(레포트·마케팅·홈)은 캡처 DOM 이
  //    아예 없다(`main` 길이 0). 그런데 런타임은 `screens[route]` 가 **있으면**
  //    그걸 깔려 하고, `CHART_ROUTES` 분기(= bindChart 로 차트를 그리는 길)로
  //    **안 들어간다.** 빈 걸 올려 두는 바람에 레포트가 계속 비었다(2026-10-13).
  //    ⚠️ 런타임 자신도 `s.main.length < 200` 이면 버린다 — 같은 기준을 쓴다.
  if (hit && !window.MQ.screens[path]) {
    const sc = await json(`${BASE}/screens/${hit.file}`)
    if (sc.main && sc.main.length >= 200) window.MQ.screens[path] = sc
  }
  window.MQ_BASE = laneBase()

  await loadRuntime()
  if (typeof window.__mqShow === 'function') {
    try {
      // ⚠️ 캡처가 없는 경로(API 문서·VibeCoding·차트 셸)도 show() 가 알아서 분기한다.
      window.__mqShow(path)
    } catch (e) {
      console.warn('[view-v1] 화면 그리기 실패:', e)
    }
  }

  if (path.includes('/chair-briefing')) {
    requestAnimationFrame(() => injectChairCollapse())
  }

  // 런타임이 토글을 지웠을 수 있다(바깥에 뒀지만 안전망).
  if (!document.querySelector('.vv-mode')) buildToggle()
}

function injectChairCollapse() {
  if (document.getElementById('vvChairCollapseStyle')) return
  const style = document.createElement('style')
  style.id = 'vvChairCollapseStyle'
  style.textContent = `.vv-chair-detail{max-height:0;overflow:hidden;transition:max-height .2s ease}.vv-chair-detail.open{max-height:600px}.vv-chair-toggle{cursor:pointer;user-select:none;font-size:11px;color:#6b7280;padding:2px 6px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;white-space:nowrap}.vv-chair-toggle:hover{background:#e5e7eb}`
  document.head.appendChild(style)

  const DETAIL_KEYWORDS = ['의료기록', '수가', '보험코드', '진단명', '처방', '차트메모']
  const main = document.querySelector('main')
  if (!main) return

  main.querySelectorAll('*').forEach((el) => {
    const text = el.textContent?.trim() ?? ''
    const isDetailLabel = DETAIL_KEYWORDS.some((kw) => text.startsWith(kw) && text.length < kw.length + 10)
    if (!isDetailLabel) return
    const parent = el.closest('[class*="card"], [class*="section"], [class*="field"], [class*="item"]') || el.parentElement
    if (!parent || parent.dataset.vvWrapped) return
    parent.dataset.vvWrapped = '1'
    const siblings = Array.from(parent.parentElement?.children ?? []).filter((c) => c !== parent)
    if (!siblings.length) return
    const wrap = document.createElement('div')
    wrap.className = 'vv-chair-detail'
    siblings.forEach((s) => { parent.parentElement.insertBefore(wrap, s); wrap.appendChild(s) })
    const btn = document.createElement('button')
    btn.className = 'vv-chair-toggle'
    btn.textContent = '세부 항목 ▼'
    btn.onclick = () => {
      const isOpen = wrap.classList.toggle('open')
      btn.textContent = isOpen ? '세부 항목 ▲' : '세부 항목 ▼'
    }
    parent.appendChild(btn)
  })
}

async function boot() {
  // 🔴 **원본 껍데기를 먼저 깐다.** 사이드바(`.side-nav`)·헤더가 있어야
  //    런타임의 `setSide`·`wireAccordion`·`addAdminGroups`·`markActive` 가 동작한다.
  //    없으면 그 함수들이 **조용히 아무 일도 안 해** 메뉴가 사라진다.
  const [runtime, shell] = await Promise.all([
    json(`${BASE}/assets/runtime.json`),
    text(`${BASE}/parts/shell.html`),
  ])
  // ⚠️ 껍데기는 `<main>` **직전까지**다 — 빈 `<main>` 을 **우리가 붙여 준다.**
  //    안 붙이면 `setMain` 이 바꿀 대상이 없어 **본문이 통째로 안 뜬다**
  //    (2026-10-13: 사이드바는 살아났는데 본문이 비었다).
  $('vvRoot').innerHTML = shell + '<main class="h-full"></main>'
  // 🔴 원본 런타임이 읽는 자리 — `<script id="mq-data">` 대신 여기서 준다.
  //    `screens` 는 파일로 쪼갰으니 지금 보는 화면만 그때그때 끼운다.
  window.MQ = { ...runtime, screens: {} }
  window.MQ_BASE = laneBase()

  buildToggle()
  addEventListener('hashchange', render)

  // 🔴 **좌측 탭 클릭을 런타임보다 먼저 받아 캡처를 미리 끼운다.**
  //
  // 사용자 보고(2026-10-13): 「예약관련 버튼을 누르면 **사본에 없는 화면**이라고
  // 토스트가 뜬다. 되었던 게 안 된다.」 — 내가 깨뜨린 것이었다.
  //
  // 원인: 원본은 화면 38개가 **처음부터 `D.screens` 에 다 들어** 있었다. 그래서
  // 런타임의 클릭 핸들러가 `show(href)` 를 **동기로** 부를 수 있었다
  // (`legacy-runtime.js:3758`). 그런데 나는 화면을 파일로 쪼개고 `screens:{}` 로
  // 비워 둔 뒤 `render()` 에서 그때그때 받도록 바꿨다. 결과:
  //
  //   ① 링크 클릭 → 런타임 핸들러가 **동기로** `show()` → `screens[route]` 가 비어
  //      `false` → 🔴 **「사본에 없는 화면」 토스트**
  //   ② 핸들러가 `preventDefault()` 를 했으니 해시가 안 바뀌고,
  //      내 `render()` 는 `hashchange` 로 걸려 있어 **아예 안 돈다** → 영영 못 받는다
  //
  // 그래서 **주소로 직접 열면 되고(boot→render 가 먼저 받는다) 클릭하면 안 되는**
  // 증상이었다. 사용자가 본 그대로다.
  //
  // 고치는 법: 같은 클릭을 **캡처 단계에서 먼저** 받아(런타임은 버블 단계다)
  // 캡처를 끼워 넣고, 그 다음 런타임이 `show()` 하게 둔다.
  //
  // ⚠️ 런타임의 판단을 **흉내내지 않는다.** 여기서는 「그 경로의 캡처 파일을
  //    받아 둔다」만 하고, 그릴지 말지는 런타임이 정한다 — 분기 규칙(차트 화면·
  //    셸 화면·빈 캡처 버리기)을 두 곳에 두면 반드시 어긋난다.
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return
      const a = e.target.closest?.('a[href^="/"]')
      if (!a || a.target === '_blank') return
      // 🔴 링크 **안의 버튼·토글 칸**은 링크가 아니다 — 사이드바 머리 `<a href="/home">` 안에 데이터 토글·햄버거가
      //    있어, 대시보드 캡처를 아직 안 받은 상태면 여기서 /home 으로 끌고 가 **토글이 동작하지 않았다**
      //    (실측 2026-10-21: 동의서 리스트에서 「개발데이터」 → #/home · 모드 그대로). 런타임 라우터와 같은 기준.
      const inBtn = e.target.closest?.('button, #vvMode, .vv-modes, #mq-side-ham')
      if (inBtn && a.contains(inBtn)) return
      // 🔴 사이드바 머리 전체는 링크가 아니다 — 버튼 사이 여백을 눌러도 /home 으로 튕겼다(런타임과 같은 기준).
      if (a.classList?.contains('side-nav-header')) { e.preventDefault(); return }
      const href = a.getAttribute('href')
      // 실제 페이지로 여는 것들 — 런타임과 같은 기준(legacy-runtime.js:3756).
      if (/^\/(vibe|api|vendor|assets)\//.test(href)) return
      if (window.MQ?.screens?.[href]) return // 이미 있다 — 그냥 런타임에 맡긴다

      const hit = INDEX?.find((s) => s.path === href)
      if (!hit) return // 인덱스에 없다 → 런타임이 셸·차트로 분기하거나 토스트한다

      // 🔴 캡처를 받아 끼운 뒤 **클릭을 다시 일으킨다.** fetch 가 비동기라
      //    이 클릭은 막고(런타임이 빈 손으로 show 하지 않게), 받아 온 다음
      //    같은 링크를 다시 눌러 런타임이 정상 경로를 타게 한다.
      e.preventDefault()
      // 🔴 `stopPropagation()` 으로는 **못 막는다.** 런타임도 `document` 에 **캡처**로
      //    걸려 있어(`legacy-runtime.js:3759` 의 `true`), 같은 노드의 캡처 리스너는
      //    등록 순서대로 **둘 다** 돈다. 런타임이 먼저 등록돼 있으면 그쪽이 먼저
      //    `show()` 를 해 버려 **토스트가 그대로 뜬다**(2026-10-13 브라우저 실측).
      //    → `stopImmediatePropagation()` 라야 같은 노드의 **남은 리스너**까지 막는다.
      e.stopImmediatePropagation()
      json(`${BASE}/screens/${hit.file}`)
        .then((sc) => {
          // ⚠️ 빈 캡처는 올리지 않는다 — 런타임의 차트 분기를 막는다(render 와 같은 기준).
          if (sc.main && sc.main.length >= 200) window.MQ.screens[href] = sc
        })
        .catch((err) => console.warn('[view-v1] 화면을 받지 못했다:', href, err))
        .finally(() => {
          if (typeof window.__mqShow === 'function') {
            try {
              window.__mqShow(href)
            } catch (err) {
              console.warn('[view-v1] 화면 그리기 실패:', href, err)
            }
          }
          if (!document.querySelector('.vv-mode')) buildToggle()
        })
    },
    true, // 🔴 캡처 단계 — 런타임(버블)보다 먼저 받아야 의미가 있다
  )

  await render()
}

boot().catch((e) => {
  const m = document.querySelector('main')
  if (m) {
    m.innerHTML = `<div style="padding:40px;text-align:center;color:#8b95a1">
      화면을 시작하지 못했어요<br><code style="color:#f04452">${String(e.message)}</code></div>`
  }
})
