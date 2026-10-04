'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type Props = { running: boolean; onReady: () => void; onUnavailable: () => void }
type Control = { setRunning: (value: boolean) => void }

function releaseModel(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const skeletons = new Set<THREE.Skeleton>()
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      const map = (material as THREE.MeshBasicMaterial).map
      if (map) textures.add(map)
    }
  })
  for (const texture of textures) { (texture.image as {close?: () => void} | undefined)?.close?.(); texture.dispose() }
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}

export default function PortraitScene({ running, onReady, onUnavailable }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const control = useRef<Control | null>(null)
  const runningRef = useRef(running)

  useEffect(() => {
    runningRef.current = running
    control.current?.setRunning(running)
  }, [running])

  useEffect(() => {
    const container = host.current, surface = canvas.current
    if (!container || !surface) return
    let active = true, playing = false, frame: number | null = null, lastFrame: number | null = null
    let model: THREE.Group | null = null, renderer: THREE.WebGLRenderer | null = null
    let mixer: THREE.AnimationMixer | null = null, resizeObserver: ResizeObserver | null = null
    let scene: THREE.Scene, camera: THREE.OrthographicCamera, bounds: THREE.Box3

    const cancel = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null }
    const render = () => { if (active && renderer) renderer.render(scene, camera) }
    const schedule = () => {
      if (active && playing && !document.hidden && frame === null) frame = requestAnimationFrame(tick)
    }
    const tick = (now: number) => {
      frame = null
      if (!active || !playing || document.hidden) return
      const delta = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, .05)
      lastFrame = now
      mixer?.update(delta)
      render()
      schedule()
    }
    const setRunning = (value: boolean) => { playing = value; lastFrame = null; if (playing) schedule(); else cancel() }
    const visibility = () => { lastFrame = null; if (document.hidden) cancel(); else schedule() }
    const dispose = () => {
      if (!active) return
      active = false; cancel(); control.current = null
      resizeObserver?.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      surface.removeEventListener('webglcontextlost', contextLost)
      mixer?.stopAllAction()
      if (model) { mixer?.uncacheRoot(model); releaseModel(model) }
      renderer?.dispose()
    }
    const contextLost = (event: Event) => { event.preventDefault(); dispose(); onUnavailable() }
    const resize = () => {
      if (!active || !renderer) return
      const { width, height } = container.getBoundingClientRect()
      if (width < 1 || height < 1) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 600 ? 1.25 : 1.5))
      renderer.setSize(width, height, false)
      const size = bounds.getSize(new THREE.Vector3()), aspect = width / height
      const worldHeight = Math.max(size.y * 1.055, size.x * 1.055 / aspect)
      Object.assign(camera, { left: -worldHeight * aspect / 2, right: worldHeight * aspect / 2, top: worldHeight / 2, bottom: -worldHeight / 2 })
      camera.updateProjectionMatrix(); render()
    }

    void (async () => {
      const gltf = await new GLTFLoader().loadAsync('/rig/kuniman.glb')
      if (!active) { releaseModel(gltf.scene); return }
      model = gltf.scene
      mixer = new THREE.AnimationMixer(model)
      const clip = gltf.animations.find(value => value.name === 'Kuni_Idle') || gltf.animations[0]
      if (clip) { mixer.clipAction(clip).play(); mixer.setTime(0) }
      model.updateMatrixWorld(true)
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        object.frustumCulled = false
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.toneMapped = false
          if (material.transparent) material.depthWrite = false
        }
        if (object instanceof THREE.SkinnedMesh) object.computeBoundingBox()
      })
      bounds = new THREE.Box3().setFromObject(model, true)
      model.position.sub(bounds.getCenter(new THREE.Vector3()))
      scene = new THREE.Scene(); scene.add(model)
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10); camera.position.z = 3
      renderer = new THREE.WebGLRenderer({ canvas: surface, alpha: true, antialias: true, powerPreference: 'low-power' })
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container)
      surface.addEventListener('webglcontextlost', contextLost)
      document.addEventListener('visibilitychange', visibility)
      control.current = { setRunning }
      resize(); onReady(); setRunning(runningRef.current)
    })().catch(() => { if (active) { dispose(); onUnavailable() } })

    return dispose
  }, [onReady, onUnavailable])

  return <div ref={host} className="rig-host"><canvas ref={canvas} aria-hidden="true" /></div>
}
