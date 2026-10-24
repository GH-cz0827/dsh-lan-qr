/**
 * dsh-lan-qr — browser half.
 *
 * Adds one icon button in the window-menu row, immediately to the RIGHT of the
 * 「编辑」 / "Edit" control (the same row that carries the refresh button when
 * dsh-refresh-button is installed). Click it to see the pairing QR for the phone.
 *
 * Design constraints learned the hard way:
 *  - No always-on overlay: the button is a normal in-row flex item, never a fixed
 *    pill, so it cannot cover neighbouring controls.
 *  - No full-document walks on every mutation: mounting retries on a 200ms timer
 *    for 12s, then a cheap observer only re-mounts when the button got detached.
 *  - All styling is inline (the row may live inside a shadow root).
 *  - Everything is wrapped: this module must never throw into the host page.
 */
window.__ModuleLoader__.load({
  id: 'dsh-lan-qr',
  factory: function (require) {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var BTN_ID = 'dsh-lan-qr-button'
    var OVERLAY_ID = 'dsh-lan-qr-overlay'
    var STATE_URL = '/lan-qr/state'
    var ICON_SRC = '/lan-qr/icon.svg'
    var ICON_SIZE = 16
    var BOX = 24
    var FALLBACK_GLYPH =
      '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<rect x="2.5" y="2.5" width="5" height="5" rx="1"/><rect x="12.5" y="2.5" width="5" height="5" rx="1"/>' +
      '<rect x="2.5" y="12.5" width="5" height="5" rx="1"/>' +
      '<path d="M12.5 12.5h2.2v2.2h-2.2zM17.5 12.5v5h-5"/>' +
      '</svg>'

    function isZh() {
      try {
        var lang = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase()
        return lang.indexOf('zh') === 0
      } catch (e) {
        return false
      }
    }

    var ZH = {
      button: '手机连接二维码',
      title: '手机连接这台 DSH',
      loading: '读取配对地址…',
      tip: '手机 App → 右上角相机图标「扫码配对」',
      copy: '复制链接',
      copied: '已复制',
      close: '关闭',
      noUrl: '还没有可用的局域网地址：桌面端启动后会写入配对文件，也可以重启一次再点这里。',
      qrFail: '二维码生成失败',
      fetchFail: '读取失败：/lan-qr/state 不可用（宿主半可能没挂载）',
      candidates: '本机局域网地址：',
    }

    var EN = {
      button: 'Phone pairing QR',
      title: 'Connect this DSH from your phone',
      loading: 'Reading the pairing URL…',
      tip: 'Phone app → camera icon (top right) → Scan to pair',
      copy: 'Copy link',
      copied: 'Copied',
      close: 'Close',
      noUrl: 'No LAN address yet: the desktop host writes the pairing file on start. Restart once and open this again.',
      qrFail: 'QR generation failed',
      fetchFail: 'Read failed: /lan-qr/state is unavailable (the host half may not be mounted)',
      candidates: 'LAN addresses on this host:',
    }

    function T() {
      return isZh() ? ZH : EN
    }

    var imgEl = null
    var btnEl = null
    var timer = null
    var ticks = 0

    function isDark() {
      try {
        if (document.body && document.body.hasAttribute('data-ds-dark-theme')) return true
        if (document.documentElement.classList.contains('dark')) return true
        var bg = getComputedStyle(document.body || document.documentElement).backgroundColor || ''
        var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg)
        if (m) return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 110
      } catch (e) {}
      return false
    }

    function collectRoots() {
      var roots = [document]
      var n = 0
      for (var i = 0; i < roots.length && n < 40; i++) {
        var all
        try {
          all = roots[i].querySelectorAll('*')
        } catch (e) {
          continue
        }
        for (var j = 0; j < all.length; j++) {
          var sr = all[j].shadowRoot
          if (sr) {
            roots.push(sr)
            n += 1
          }
        }
      }
      return roots
    }

    function findRefresh(roots) {
      for (var i = 0; i < roots.length; i++) {
        try {
          var el = roots[i].querySelector('#dsh-refresh-button')
          if (el) return el
        } catch (e) {}
      }
      return null
    }

    function textOf(el) {
      return ((el && el.textContent) || '').replace(/\s+/g, '')
    }

    function findEdit(row) {
      try {
        var all = row.querySelectorAll('*')
        for (var i = 0; i < all.length; i++) {
          var t = textOf(all[i])
          if (t === '编辑' || t === 'Edit') {
            var r = all[i].getBoundingClientRect()
            if (r.width > 0 && r.height > 0) return all[i]
          }
        }
      } catch (e) {}
      return null
    }

    function syncTheme() {
      if (!imgEl) return
      // the icon is single-ink line art on transparent -> invert for dark themes
      imgEl.style.filter = isDark() ? 'invert(1) brightness(1.25)' : 'none'
    }

    function iconNode() {
      var wrap = document.createElement('span')
      wrap.style.cssText = 'display:block;width:' + ICON_SIZE + 'px;height:' + ICON_SIZE + 'px;line-height:0'
      var img = document.createElement('img')
      img.alt = ''
      img.decoding = 'async'
      img.draggable = false
      img.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;pointer-events:none'
      img.onerror = function () {
        wrap.innerHTML = FALLBACK_GLYPH
      }
      img.src = ICON_SRC + '?v=' + Date.now()
      wrap.appendChild(img)
      imgEl = img
      syncTheme()
      return wrap
    }

    function makeButton() {
      var btn = document.createElement('button')
      btn.id = BTN_ID
      btn.type = 'button'
      btn.title = T().button
      btn.setAttribute('aria-label', T().button)
      btn.style.cssText = [
        'box-sizing:border-box',
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'flex:0 0 auto',
        'align-self:center',
        'padding:0',
        'border:0',
        'border-radius:9px',
        'cursor:pointer',
        'background:transparent',
        'color:inherit',
        'opacity:0.8',
        'width:' + BOX + 'px',
        'height:' + BOX + 'px',
        'margin:0 6px 0 2px',
        '-webkit-app-region:no-drag',
        'transition:background .12s ease,opacity .12s ease',
      ].join(';') + ';'
      btn.appendChild(iconNode())
      btn.addEventListener('mouseenter', function () {
        btn.style.opacity = '1'
        btn.style.background = isDark() ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)'
      })
      btn.addEventListener('mouseleave', function () {
        btn.style.opacity = '0.8'
        btn.style.background = 'transparent'
      })
      btn.addEventListener('mousedown', function (ev) {
        ev.preventDefault()
        ev.stopPropagation()
      })
      btn.addEventListener('click', function (ev) {
        ev.preventDefault()
        ev.stopPropagation()
        openDialog()
      })
      return btn
    }

    function findRowByAppLabel(roots) {
      // fallback when the refresh plugin is absent: their row is the parent of the 「应用」 label
      for (var i = 0; i < roots.length; i++) {
        var all
        try {
          all = roots[i].querySelectorAll('*')
        } catch (e) {
          continue
        }
        for (var j = 0; j < all.length; j++) {
          var el = all[j]
          if (el.id === BTN_ID) continue
          var t = textOf(el)
          if (t !== '应用' && t !== 'App') continue
          var r = el.getBoundingClientRect()
          if (!r.width || !r.height || r.top > 120 || r.left > 700) continue
          if (el.parentNode) return el.parentNode
        }
      }
      return null
    }

    function mount() {
      if (btnEl && btnEl.isConnected) return true
      var roots = collectRoots()
      var refresh = findRefresh(roots)
      var row = refresh && refresh.parentNode ? refresh.parentNode : findRowByAppLabel(roots)
      if (!row) return false
      if (!btnEl) btnEl = makeButton()
      var edit = findEdit(row)
      if (edit && edit.parentNode) {
        edit.parentNode.insertBefore(btnEl, edit.nextSibling)
      } else if (refresh && refresh.parentNode === row) {
        row.insertBefore(btnEl, refresh.nextSibling)
      } else {
        row.insertBefore(btnEl, row.firstChild)
      }
      return true
    }

    /**
     * Centered card — the position the previous version used.
     *
     * No dimming backdrop: the top-right minimize / maximize / close buttons are drawn by
     * Electron outside the DOM and can never be dimmed, so any scrim looks like a missing
     * corner. A transparent full-window layer still catches click-outside and Escape.
     */
    function openDialog() {
      if (document.getElementById(OVERLAY_ID)) return
      var text = T()
      var cardWidth = 360

      var overlay = document.createElement('div')
      overlay.id = OVERLAY_ID
      overlay.style.cssText =
        'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:transparent;padding:16px;box-sizing:border-box;' +
        'width:auto;height:auto;z-index:2147483000;font-family:inherit'

      var card = document.createElement('div')
      card.style.cssText =
        'background:' + (isDark() ? '#1B1F27' : '#ffffff') + ';' +
        'color:' + (isDark() ? '#E7ECF3' : '#1B1F27') + ';' +
        'border-radius:14px;padding:18px;width:' + cardWidth + 'px;max-width:100%;' +
        'box-sizing:border-box;text-align:center;max-height:calc(100vh - 32px);overflow:auto;' +
        'border:1px solid rgba(127,127,127,.30);box-shadow:0 12px 32px rgba(0,0,0,.38)'

      var title = document.createElement('div')
      title.textContent = text.title
      title.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:12px'
      card.appendChild(title)

      var slot = document.createElement('div')
      slot.style.cssText = 'display:flex;justify-content:center;margin-bottom:10px;min-height:60px'
      slot.textContent = text.loading
      card.appendChild(slot)

      var urlLine = document.createElement('div')
      urlLine.style.cssText =
        'font-size:11px;opacity:.72;word-break:break-all;user-select:all;max-height:56px;' +
        'overflow:auto;margin-bottom:10px;text-align:left'
      card.appendChild(urlLine)

      var tip = document.createElement('div')
      tip.style.cssText = 'font-size:12px;opacity:.72'
      tip.textContent = text.tip
      card.appendChild(tip)

      var actions = document.createElement('div')
      actions.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:16px'

      function mk(label, primary) {
        var b = document.createElement('button')
        b.type = 'button'
        b.textContent = label
        b.style.cssText =
          'padding:6px 16px;border-radius:10px;cursor:pointer;font-size:13px;font-family:inherit;' +
          (primary
            ? 'border:1px solid transparent;background:#4C8DFF;color:#0B1220;font-weight:600'
            : 'border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit')
        return b
      }

      function dismiss() {
        try {
          overlay.remove()
        } catch (e) {}
        document.removeEventListener('mousedown', onDocDown, true)
        document.removeEventListener('keydown', esc, true)
      }
      function onDocDown(ev) {
        if (!card.contains(ev.target)) dismiss()
      }
      function esc(ev) {
        if (ev.key === 'Escape') dismiss()
      }

      var copy = mk(text.copy, true)
      copy.addEventListener('click', function () {
        var value = urlLine.textContent || ''
        try {
          navigator.clipboard.writeText(value)
          copy.textContent = text.copied
          setTimeout(function () {
            copy.textContent = text.copy
          }, 1200)
        } catch (e) {}
      })

      var close = mk(text.close, false)
      close.addEventListener('click', dismiss)
      actions.appendChild(copy)
      actions.appendChild(close)
      card.appendChild(actions)

      overlay.appendChild(card)
      document.body.appendChild(overlay)
      // give the listeners one tick so the opening click does not immediately dismiss
      setTimeout(function () {
        document.addEventListener('mousedown', onDocDown, true)
        document.addEventListener('keydown', esc, true)
      }, 0)

      fetch(STATE_URL, { credentials: 'include' })
        .then(function (r) {
          return r.json()
        })
        .then(function (data) {
          var url = (data && data.url) || ''
          var svg = (data && data.svg) || ''
          var candidates = (data && data.candidates) || []
          if (!url) {
            slot.textContent = text.noUrl
            slot.style.color = '#FF6B6B'
            slot.style.fontSize = '12px'
            urlLine.textContent = (data && data.stateFile) || ''
            return
          }
          slot.innerHTML = svg || text.qrFail
          var svgEl = slot.querySelector('svg')
          if (svgEl) {
            svgEl.style.width = '240px'
            svgEl.style.height = '240px'
            svgEl.style.borderRadius = '8px'
          }
          urlLine.textContent = url
          if (data && data.hasToken === false) {
            // A tokenless QR scans fine and then fails with 401, which looks like a phone bug.
            var warn = document.createElement('div')
            warn.style.cssText = 'font-size:12px;color:#FF6B6B;margin-top:8px;text-align:left'
            warn.textContent = '二维码里没有令牌：插件没拿到 connection 服务。重启桌面端后再点这里。'
            card.appendChild(warn)
          }
          if (data && data.source === 'lan-interface' && candidates.length > 0) {
            var hint = document.createElement('div')
            hint.style.cssText = 'font-size:11px;opacity:.6;margin-top:6px;text-align:left'
            hint.textContent = text.candidates + ' ' + candidates.join(' · ')
            card.appendChild(hint)
          }
        })
        .catch(function () {
          slot.textContent = text.fetchFail
          slot.style.color = '#FF6B6B'
          slot.style.fontSize = '12px'
        })
    }

    function boot() {
      if (window.__dshLanQrBooted) return
      window.__dshLanQrBooted = true
      timer = setInterval(function () {
        ticks += 1
        try {
          mount()
          syncTheme()
        } catch (e) {}
        if ((btnEl && btnEl.isConnected) || ticks > 60) {
          clearInterval(timer)
          timer = null
        }
      }, 200)
      try {
        var pending = false
        new MutationObserver(function (records) {
          var themeTouched = false
          for (var i = 0; i < records.length; i++) {
            if (records[i].type === 'attributes') {
              themeTouched = true
              break
            }
          }
          if (themeTouched) syncTheme()
          if (pending) return
          if (btnEl && btnEl.isConnected) return
          pending = true
          setTimeout(function () {
            pending = false
            try {
              mount()
              syncTheme()
            } catch (e) {}
          }, 600)
        }).observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-ds-dark-theme', 'class'],
        })
      } catch (e) {}
    }

    function apply() {
      try {
        boot()
      } catch (e) {
        console.error('[dsh-lan-qr] boot failed', e)
      }
    }

    exports.apply = apply
    exports.inject = []
    exports.openDialog = openDialog
    // Belt and braces: some Host builds never invoke apply() (their declared client runtime
    // can be absent). boot() is idempotent through __dshLanQrBooted, so this is safe.
    try {
      setTimeout(apply, 1200)
    } catch (e) {}
    return module.exports
  },
})
