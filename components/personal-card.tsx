'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Asterisk, Pause, Play } from 'lucide-react'

const PortraitScene = dynamic(() => import('@/components/portrait-scene'), { ssr: false })

export function PersonalCard() {
  const [running, setRunning] = useState(false)
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState(true)
  const onReady = useCallback(() => setReady(true), [])
  const onUnavailable = useCallback(() => { setReady(false); setAvailable(false) }, [])

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setRunning(!preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  return <div className="personal-page">
    <header className="personal-header">
      <a className="personal-logo" href="/" aria-label="kuniman.me — главная"><Asterisk size={22} strokeWidth={1.5} /><span>kuniman<span className="domain-ending">.me</span></span></a>
      <span className="header-caption">Личный уголок интернета</span>
      <span className="human-status"><span className="human-dot" />100% человек</span>
    </header>

    <main className="personal-main">
      <div className="hello-line"><span className="tiny-cross">+</span><span>ПРИВЕТ, ЭТО Я</span><span className="tiny-cross">+</span></div>
      <div className="portrait-composition">
        <h1 className="personal-name">kuniman<span className="name-period">.</span></h1>
        <div className="portrait-side-note"><span className="mono">01 / 01</span><span>Один человек.<br />Свой вайб.</span><span className="note-line" /></div>

        <figure className="portrait-figure" data-ready={ready} data-motion={running && available ? 'playing' : 'paused'}>
          {/* The static photographic portrait stays visible without JavaScript or WebGL. */}
          <img src="/rig/posed-preview.png" width={760} height={1000} alt="Kuni Man: одна кисть на груди, вторая с жестом V у рта, собачий фильтр" className={`portrait-fallback${ready ? ' portrait-loaded' : ''}`} fetchPriority="high" />
          {available && <div className="portrait-webgl"><PortraitScene running={running} onReady={onReady} onUnavailable={onUnavailable} /></div>}
          <figcaption className="sr-only">Живой портрет: голова, туловище, руки, пальцы и язык плавно двигаются.</figcaption>
        </figure>

        <div className="portrait-invitation" aria-hidden="true"><ArrowDownLeft size={29} strokeWidth={1} /><p>Свой человек<span className="invitation-dot">.</span></p><span>В своём ритме</span></div>
        <span className="portrait-stamp"><ArrowUpRight size={11} /> JUST ME, BEING ME</span>
      </div>
      <div className="personal-intro"><span className="intro-rule" /><p>Ничего лишнего.<br /><span>Просто я, немного в движении.</span></p><span className="intro-rule" /></div>
    </main>

    <footer className="personal-footer">
      <span className="copyright">© 2026 KUNIMAN</span>
      <span className="footer-note">Хорошо, что ты здесь.</span>
      <div className="footer-interaction"><Asterisk size={12} strokeWidth={1.5} /><span className="footer-motion-text">{!available ? 'В своём ритме' : running ? 'Живу в движении' : 'Момент тишины'}</span>{available && <button type="button" className="motion-toggle" disabled={!ready} onClick={() => setRunning(value => !value)} aria-label={running ? 'Приостановить движение портрета' : 'Включить движение портрета'} aria-pressed={!running} title={running ? 'Остановить анимацию' : 'Включить анимацию'}>{running ? <Pause size={12} /> : <Play size={12} />}</button>}</div>
    </footer>
  </div>
}
