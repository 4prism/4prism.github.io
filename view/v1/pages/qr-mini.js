/* QR 생성기 — **의존성 없음**.
 *
 * 🔴 **왜 직접 쓰나**: 병원 내부망은 **인터넷이 없을 수 있다**(CLAUDE.md · `/management/ops`
 *    와 같은 규칙 — CDN 을 쓰지 않는다). 라이브러리를 받아 올 수 없으므로 여기에 둔다.
 *
 * 범위를 **일부러 좁혔다** — 접수 URL 하나를 담으면 되므로:
 *   · 바이트 모드만 · 오류정정 L · 버전 자동(1~10, 최대 154바이트)
 *   · 마스크는 0~7 전부 평가해 **벌점이 가장 낮은 것**을 고른다(인쇄물이라 인식률이 중요)
 * 내부망 URL 은 길어야 60~70자라 버전 4~5 에 들어간다.
 */
'use strict'
var QRMini = (function () {
  /* ── GF(256) ─────────────────────────────────────────────────── */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256)
  ;(function () {
    for (var i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]
  })()
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]] }

  /* 생성 다항식 */
  function genPoly(n) {
    var g = [1]
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0)
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j]
        ng[j + 1] ^= mul(g[j], EXP[i])
      }
      g = ng
    }
    return g
  }
  function ecBytes(data, n) {
    var g = genPoly(n), res = new Array(data.length + n).fill(0)
    for (var i = 0; i < data.length; i++) res[i] = data[i]
    for (var i2 = 0; i2 < data.length; i2++) {
      var f = res[i2]
      if (!f) continue
      for (var j = 0; j < g.length; j++) res[i2 + j] ^= mul(g[j], f)
    }
    return res.slice(data.length)
  }

  /* 버전별 (총 코드워드, EC 코드워드/블록, 블록수) — 오류정정 L, 버전 1~10 */
  var CAP = {
    1:  [26, 7, 1],   2:  [44, 10, 1],  3:  [70, 15, 1],  4:  [100, 20, 1],
    5:  [134, 26, 1], 6:  [172, 18, 2], 7:  [196, 20, 2],  8:  [242, 24, 2],
    9:  [292, 30, 2], 10:[346, 18, 4]
  }
  var ALIGN = { 1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34],
                7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50] }

  function dataCapacity(ver) { var c = CAP[ver]; return c[0] - c[1] * c[2] }

  /* ── 비트 버퍼 ───────────────────────────────────────────────── */
  function Bits() { this.a = []; }
  Bits.prototype.put = function (v, n) {
    for (var i = n - 1; i >= 0; i--) this.a.push((v >>> i) & 1)
  }

  /* ── 모듈 배치 ───────────────────────────────────────────────── */
  function makeMatrix(ver) {
    var n = ver * 4 + 17
    var m = [], rsv = []
    for (var i = 0; i < n; i++) { m.push(new Array(n).fill(0)); rsv.push(new Array(n).fill(0)) }
    function finder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue
        var on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                 (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                 (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
        m[rr][cc] = on ? 1 : 0; rsv[rr][cc] = 1
      }
    }
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0)
    // 타이밍
    for (var i2 = 8; i2 < n - 8; i2++) {
      m[6][i2] = (i2 % 2 === 0) ? 1 : 0; rsv[6][i2] = 1
      m[i2][6] = (i2 % 2 === 0) ? 1 : 0; rsv[i2][6] = 1
    }
    // 정렬 패턴
    var ap = ALIGN[ver]
    for (var a = 0; a < ap.length; a++) for (var b = 0; b < ap.length; b++) {
      var r2 = ap[a], c2 = ap[b]
      if (rsv[r2][c2]) continue
      for (var dr2 = -2; dr2 <= 2; dr2++) for (var dc2 = -2; dc2 <= 2; dc2++) {
        var on2 = Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1
        m[r2 + dr2][c2 + dc2] = on2 ? 1 : 0; rsv[r2 + dr2][c2 + dc2] = 1
      }
    }
    // 포맷 영역 예약 + 다크 모듈
    for (var k = 0; k < 9; k++) { rsv[8][k] = 1; rsv[k][8] = 1 }
    for (var k2 = 0; k2 < 8; k2++) { rsv[8][n - 1 - k2] = 1; rsv[n - 1 - k2][8] = 1 }
    m[n - 8][8] = 1; rsv[n - 8][8] = 1
    return { m: m, rsv: rsv, n: n }
  }

  function placeData(mm, bits) {
    var m = mm.m, rsv = mm.rsv, n = mm.n, idx = 0, up = true
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--
      for (var i = 0; i < n; i++) {
        var row = up ? (n - 1 - i) : i
        for (var c = 0; c < 2; c++) {
          var cc = col - c
          if (rsv[row][cc]) continue
          m[row][cc] = idx < bits.length ? bits[idx] : 0
          idx++
        }
      }
      up = !up
    }
  }

  function applyMask(m, rsv, n, mask) {
    var out = []
    for (var r = 0; r < n; r++) {
      out.push(m[r].slice())
      for (var c = 0; c < n; c++) {
        if (rsv[r][c]) continue
        var f
        switch (mask) {
          case 0: f = (r + c) % 2 === 0; break
          case 1: f = r % 2 === 0; break
          case 2: f = c % 3 === 0; break
          case 3: f = (r + c) % 3 === 0; break
          case 4: f = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break
          case 5: f = ((r * c) % 2 + (r * c) % 3) === 0; break
          case 6: f = (((r * c) % 2 + (r * c) % 3) % 2) === 0; break
          default: f = (((r + c) % 2 + (r * c) % 3) % 2) === 0
        }
        if (f) out[r][c] ^= 1
      }
    }
    return out
  }

  /* 포맷 정보 — EC level L(01) + 마스크 */
  function putFormat(m, n, mask) {
    var fmt = (0x01 << 3) | mask
    var d = fmt << 10
    for (var i = 0; i < 5; i++) if ((d >>> (14 - i)) & 1) d ^= 0x537 >>> i
    var bits = ((fmt << 10) | d) ^ 0x5412
    for (var k = 0; k < 15; k++) {
      var b = (bits >>> k) & 1
      if (k < 6) m[k][8] = b
      else if (k < 8) m[k + 1][8] = b
      else if (k === 8) m[8][7] = b
      else m[8][14 - k] = b
      if (k < 8) m[8][n - 1 - k] = b
      else m[n - 15 + k][8] = b
    }
  }

  /* 벌점 — 인쇄물이라 인식률이 중요해 4규칙 전부 본다 */
  function penalty(m, n) {
    var p = 0, i, j, k
    for (i = 0; i < n; i++) {
      for (var dir = 0; dir < 2; dir++) {
        var run = 1
        for (j = 1; j < n; j++) {
          var a = dir ? m[j][i] : m[i][j], b = dir ? m[j - 1][i] : m[i][j - 1]
          if (a === b) { run++ } else { if (run >= 5) p += 3 + (run - 5); run = 1 }
        }
        if (run >= 5) p += 3 + (run - 5)
      }
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < n - 1; j++) {
      var s = m[i][j] + m[i][j+1] + m[i+1][j] + m[i+1][j+1]
      if (s === 0 || s === 4) p += 3
    }
    var pat = [1,0,1,1,1,0,1,0,0,0,0]
    for (i = 0; i < n; i++) for (j = 0; j + 11 <= n; j++) {
      var okR = true, okC = true
      for (k = 0; k < 11; k++) { if (m[i][j+k] !== pat[k]) okR = false; if (m[j+k][i] !== pat[k]) okC = false }
      if (okR) p += 40
      if (okC) p += 40
    }
    var dark = 0
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) dark += m[i][j]
    p += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10
    return p
  }

  /* ── 공개 API ────────────────────────────────────────────────── */
  /** 문자열 → 모듈 2차원 배열(1=검정). 실패하면 null. */
  function encode(text) {
    var bytes = []
    var utf = unescape(encodeURIComponent(text))
    for (var i = 0; i < utf.length; i++) bytes.push(utf.charCodeAt(i) & 0xff)

    var ver = 0
    for (var v = 1; v <= 10; v++) {
      var need = 4 + (v < 10 ? 8 : 16) + bytes.length * 8
      if (need <= dataCapacity(v) * 8) { ver = v; break }
    }
    if (!ver) return null   // 🔴 너무 길면 **그리지 않는다** — 깨진 QR 보다 낫다

    var bb = new Bits()
    bb.put(4, 4)                                   // 바이트 모드
    bb.put(bytes.length, ver < 10 ? 8 : 16)
    for (var b2 = 0; b2 < bytes.length; b2++) bb.put(bytes[b2], 8)
    var cap = dataCapacity(ver) * 8
    bb.put(0, Math.min(4, cap - bb.a.length))
    while (bb.a.length % 8) bb.a.push(0)
    var dw = []
    for (var k2 = 0; k2 < bb.a.length; k2 += 8) {
      var byte = 0
      for (var z = 0; z < 8; z++) byte = (byte << 1) | bb.a[k2 + z]
      dw.push(byte)
    }
    var pad = [0xec, 0x11], pi = 0
    while (dw.length < dataCapacity(ver)) { dw.push(pad[pi % 2]); pi++ }

    // 블록 분할 → 인터리브
    var c3 = CAP[ver], nb = c3[2], ecLen = c3[1]
    var per = Math.floor(dw.length / nb), extra = dw.length % nb
    var dBlocks = [], eBlocks = [], off = 0
    for (var bi = 0; bi < nb; bi++) {
      var len = per + (bi >= nb - extra ? 1 : 0)
      var blk = dw.slice(off, off + len); off += len
      dBlocks.push(blk); eBlocks.push(ecBytes(blk, ecLen))
    }
    var out = []
    var maxD = Math.max.apply(null, dBlocks.map(function (x) { return x.length }))
    for (var ci = 0; ci < maxD; ci++) for (var bj = 0; bj < nb; bj++) if (ci < dBlocks[bj].length) out.push(dBlocks[bj][ci])
    for (var ei = 0; ei < ecLen; ei++) for (var bk = 0; bk < nb; bk++) out.push(eBlocks[bk][ei])

    var bits = []
    for (var oi = 0; oi < out.length; oi++) for (var ob = 7; ob >= 0; ob--) bits.push((out[oi] >>> ob) & 1)

    var mm = makeMatrix(ver)
    placeData(mm, bits)

    var best = null, bestP = Infinity
    for (var mk = 0; mk < 8; mk++) {
      var cand = applyMask(mm.m, mm.rsv, mm.n, mk)
      putFormat(cand, mm.n, mk)
      var pp = penalty(cand, mm.n)
      if (pp < bestP) { bestP = pp; best = cand }
    }
    return best
  }

  /** 모듈 배열 → SVG 문자열. `px` 는 한 변(픽셀). */
  function svg(mods, px) {
    if (!mods) return ''
    var n = mods.length, quiet = 4, total = n + quiet * 2
    var d = ''
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (mods[r][c]) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z'
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px +
      '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
      '<path d="' + d + '" fill="#000"/></svg>'
  }

  return { encode: encode, svg: svg }
})()
