export type BrainSource = Readonly<{
  isPlaying: () => boolean
  bins: () => Float32Array
}>

export type BrainEngine = Readonly<{
  attach: (canvas: HTMLCanvasElement, container: HTMLElement) => void
  start: () => void
  stop: () => void
  poke: () => void
  noteTyping: () => void
  setWordCount: (count: number) => void
}>

type Node = {
  origX: number
  origY: number
  origZ: number
  fnx: number
  fny: number
  fnz: number
  colorType: "cyan" | "amber" | "white" | "cobalt"
  ledSize: number
  glintBoost: number
}

const nodeCount = 480
const goldenAngle = Math.PI * (3 - Math.sqrt(5))

const keyLight = { x: -0.42, y: -0.55, z: 0.72 }
const keyLength = Math.hypot(keyLight.x, keyLight.y, keyLight.z)
keyLight.x /= keyLength
keyLight.y /= keyLength
keyLight.z /= keyLength

const halfVec = { x: keyLight.x, y: keyLight.y, z: keyLight.z + 1.0 }
const halfLength = Math.hypot(halfVec.x, halfVec.y, halfVec.z)
halfVec.x /= halfLength
halfVec.y /= halfLength
halfVec.z /= halfLength

const buildNodes = (): Node[] => {
  const nodes: Node[] = []
  for (let index = 0; index < nodeCount; index += 1) {
    const y = 1 - (index / (nodeCount - 1)) * 2
    const radiusAtY = Math.sqrt(1 - y * y)
    const theta = goldenAngle * index

    const x = Math.cos(theta) * radiusAtY
    const z = Math.sin(theta) * radiusAtY

    const roll = Math.random()
    const colorType: Node["colorType"] =
      roll > 0.82 ? "amber" : roll > 0.58 ? "white" : roll > 0.42 ? "cobalt" : "cyan"

    nodes.push({
      origX: x,
      origY: y,
      origZ: z,
      fnx: x + (Math.random() - 0.5) * 0.12,
      fny: y + (Math.random() - 0.5) * 0.12,
      fnz: z + (Math.random() - 0.5) * 0.12,
      colorType,
      ledSize: Math.random() * 1.5 + 1.1,
      glintBoost: 0,
    })
  }
  return nodes
}

export const createBrainEngine = (source: BrainSource): BrainEngine => {
  const nodes = buildNodes()
  const state: {
    canvas: HTMLCanvasElement | null
    context: CanvasRenderingContext2D | null
    container: HTMLElement | null
    size: number
    handle: number
    frame: number
    rotX: number
    rotY: number
    targetRotX: number
    targetRotY: number
    typingImpulse: number
    currentScale: number
    currentWordFactor: number
    danceBounceY: number
    danceRotOffset: number
    dragging: boolean
    lastMouseX: number
    lastMouseY: number
    pixelRatio: number
    wordCount: number
  } = {
    canvas: null,
    context: null,
    container: null,
    size: 530,
    handle: 0,
    frame: 0,
    rotX: 0.18,
    rotY: 0.35,
    targetRotX: 0.18,
    targetRotY: 0.35,
    typingImpulse: 0,
    currentScale: 0.72,
    currentWordFactor: 0.08,
    danceBounceY: 0,
    danceRotOffset: 0,
    dragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    pixelRatio: 1,
    wordCount: 0,
  }

  const resize = () => {
    const canvas = state.canvas
    const container = state.container
    if (canvas === null || container === null) return
    state.size = container.clientWidth || 530
    state.pixelRatio = window.devicePixelRatio || 1
    canvas.width = state.size * state.pixelRatio
    canvas.height = state.size * state.pixelRatio
    state.context?.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0)
  }

  const onMouseDown = (event: MouseEvent) => {
    state.dragging = true
    state.lastMouseX = event.clientX
    state.lastMouseY = event.clientY
  }

  const onMouseUp = () => {
    state.dragging = false
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!state.dragging) return
    state.targetRotY += (event.clientX - state.lastMouseX) * 0.007
    state.targetRotX += (event.clientY - state.lastMouseY) * 0.007
    state.lastMouseX = event.clientX
    state.lastMouseY = event.clientY
  }

  const wordProgress = () => {
    if (state.wordCount <= 0) return 0
    return Math.pow(Math.min(1.0, state.wordCount / 300), 0.45)
  }

  const renderCore = (
    target: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    baseRadius: number,
    breathe: number,
  ) => {
    const context = target
    const factor = state.currentWordFactor
    const gradient = context.createRadialGradient(
      centerX - baseRadius * 0.35,
      centerY - baseRadius * 0.35,
      baseRadius * 0.08,
      centerX,
      centerY,
      baseRadius * 1.04,
    )
    gradient.addColorStop(0, `rgba(18, 26, 42, ${(0.65 * factor).toFixed(3)})`)
    gradient.addColorStop(0.55, `rgba(8, 14, 24, ${(0.55 * factor).toFixed(3)})`)
    gradient.addColorStop(0.85, `rgba(3, 6, 14, ${(0.42 * factor).toFixed(3)})`)
    gradient.addColorStop(1, `rgba(1, 2, 4, ${(0.28 * factor).toFixed(3)})`)

    context.save()
    context.beginPath()
    const points = 32
    for (let index = 0; index <= points; index += 1) {
      const angle = (index / points) * Math.PI * 2
      const morph =
        Math.sin(angle * 3 + state.frame * 0.018) * (5 + state.typingImpulse * 4) +
        Math.cos(angle * 5 - state.frame * 0.014) * 3
      const radius = baseRadius + breathe + morph
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath()
    context.fillStyle = gradient
    context.strokeStyle = `rgba(0, 240, 255, ${(0.35 * factor).toFixed(3)})`
    context.lineWidth = 1
    context.stroke()
    context.fill()
    context.restore()
  }

  const render = () => {
    const context = state.context
    const canvas = state.canvas
    const container = state.container
    if (context === null || canvas === null || container === null) return

    state.frame += 1
    context.clearRect(0, 0, state.size, state.size)

    const progress = wordProgress()
    const targetFactor = 0.08 + progress * 0.92
    const targetScale = 0.72 + progress * 0.43
    state.currentScale += (targetScale - state.currentScale) * 0.05
    state.currentWordFactor += (targetFactor - state.currentWordFactor) * 0.05

    const bins = source.bins()
    const playing = source.isPlaying()

    if (playing) {
      const beatFrequency = (bins[0] ?? 0) * 2.2
      const beatCycle = state.frame * 0.09
      const bob = Math.abs(Math.sin(beatCycle)) * (18 + beatFrequency * 16)
      state.danceBounceY += (-bob - state.danceBounceY) * 0.22
      state.danceRotOffset += (Math.sin(beatCycle * 0.5) * 0.14 - state.danceRotOffset) * 0.12
    } else {
      state.danceBounceY += (0 - state.danceBounceY) * 0.1
      state.danceRotOffset += (0 - state.danceRotOffset) * 0.1
    }

    container.style.transform = `translate3d(0, ${state.danceBounceY.toFixed(1)}px, 0) scale(${state.currentScale.toFixed(3)})`

    state.rotX += (state.targetRotX - state.rotX) * 0.05
    state.rotY += (state.targetRotY - state.rotY) * 0.05
    state.targetRotY += 0.0016 + (playing ? 0.0025 : 0)

    if (state.typingImpulse > 0.01) state.typingImpulse *= 0.93

    const centerX = state.size * 0.5
    const centerY = state.size * 0.5
    const baseRadius = state.size * 0.35

    const breathe =
      Math.sin(state.frame * 0.016) * 5 +
      state.typingImpulse * 12 +
      (playing ? (bins[1] ?? 0) * 12 : 0)

    renderCore(context, centerX, centerY, baseRadius, breathe)

    const projected: Array<{
      x: number
      y: number
      z: number
      scale: number
      brightness: number
      glintFactor: number
      colorType: Node["colorType"]
      size: number
    }> = []

    const effectiveRotY = state.rotY + state.danceRotOffset
    const cosY = Math.cos(effectiveRotY)
    const sinY = Math.sin(effectiveRotY)
    const cosX = Math.cos(state.rotX)
    const sinX = Math.sin(state.rotX)
    const causticTime = state.frame * 0.025
    const factor = state.currentWordFactor

    for (const [index, node] of nodes.entries()) {
      const morphAmplitude =
        0.05 + Math.sin(state.frame * 0.02 + index * 0.12) * 0.03 * (1 + state.typingImpulse)
      const currentRadius = (baseRadius + breathe) * (1 + morphAmplitude)

      const x1 = node.origX * cosY - node.origZ * sinY
      const z1 = node.origX * sinY + node.origZ * cosY
      const y1 = node.origY * cosX - z1 * sinX
      const z2 = node.origY * sinX + z1 * cosX

      const nx1 = node.fnx * cosY - node.fnz * sinY
      const nz1 = node.fnx * sinY + node.fnz * cosY
      const ny1 = node.fny * cosX - nz1 * sinX
      const nz2 = node.fny * sinX + nz1 * cosX
      const normalLength = Math.hypot(nx1, ny1, nz2)
      const normX = nx1 / normalLength
      const normY = ny1 / normalLength
      const normZ = nz2 / normalLength

      const fov = 380
      const scale = fov / (fov + z2 * 140)
      const projectedX = centerX + x1 * currentRadius * scale
      const projectedY = centerY + y1 * currentRadius * scale

      const specularDot = Math.max(0, normX * halfVec.x + normY * halfVec.y + normZ * halfVec.z)
      const specularHighlight = Math.pow(specularDot, 45)
      const diffuseDot = Math.max(0, normX * keyLight.x + normY * keyLight.y + normZ * keyLight.z)

      const causticSweep = Math.sin(x1 * 2.2 + y1 * 1.8 + z2 * 1.5 - causticTime)
      const causticHighlight = Math.pow(Math.max(0, causticSweep), 16) * 0.4

      if (node.glintBoost > 0.02) node.glintBoost *= 0.94

      const glintFactor = Math.min(
        1.0,
        specularHighlight * 1.35 + causticHighlight + node.glintBoost,
      )
      const brightness = Math.min(1.0, 0.14 + diffuseDot * 0.28 + glintFactor * 0.85)

      projected.push({
        x: projectedX,
        y: projectedY,
        z: z2,
        scale,
        brightness,
        glintFactor,
        colorType: node.colorType,
        size: node.ledSize * scale,
      })
    }

    projected.sort((a, b) => a.z - b.z)

    context.lineWidth = 0.75
    const frontSubset = Math.floor(projected.length * 0.42)
    for (let i = projected.length - 1; i >= projected.length - frontSubset; i -= 1) {
      const first = projected[i]
      if (first === undefined || first.z < -0.15) continue

      for (let j = i - 1; j >= projected.length - frontSubset; j -= 1) {
        const second = projected[j]
        if (second === undefined) continue
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        if (distance < 26) {
          const lineAlpha =
            (1 - distance / 26) * 0.3 * (first.brightness + second.brightness) * factor
          context.strokeStyle = `rgba(0, 240, 255, ${lineAlpha.toFixed(3)})`
          context.beginPath()
          context.moveTo(first.x, first.y)
          context.lineTo(second.x, second.y)
          context.stroke()
        }
      }
    }

    for (const point of projected) {
      if (point.z < -0.36) continue

      const depthFade = Math.max(0.12, (point.z + 1) * 0.5)
      const brightness = Math.min(1, point.brightness * depthFade)
      const alpha = (brightness * factor).toFixed(3)

      let coreColor: string
      let glowColor: string
      if (point.colorType === "cyan") {
        coreColor = `rgba(224, 254, 255, ${alpha})`
        glowColor = `rgba(0, 240, 255, ${(brightness * 0.5 * factor).toFixed(3)})`
      } else if (point.colorType === "white") {
        coreColor = `rgba(255, 255, 255, ${alpha})`
        glowColor = `rgba(240, 249, 255, ${(brightness * 0.5 * factor).toFixed(3)})`
      } else if (point.colorType === "amber") {
        coreColor = `rgba(254, 243, 199, ${alpha})`
        glowColor = `rgba(245, 158, 11, ${(brightness * 0.6 * factor).toFixed(3)})`
      } else {
        coreColor = `rgba(191, 219, 254, ${alpha})`
        glowColor = `rgba(37, 99, 235, ${(brightness * 0.5 * factor).toFixed(3)})`
      }

      context.fillStyle = glowColor
      context.beginPath()
      context.arc(point.x, point.y, point.size * (1.2 + brightness * 0.6), 0, Math.PI * 2)
      context.fill()

      context.fillStyle = coreColor
      context.beginPath()
      context.arc(point.x, point.y, point.size * 0.6, 0, Math.PI * 2)
      context.fill()

      if (point.glintFactor > 0.5) {
        const glintPower = (point.glintFactor - 0.5) * 2.0
        const flareLength = point.size * (3.5 + glintPower * 7.0)

        context.save()
        context.strokeStyle = `rgba(255, 255, 255, ${(glintPower * factor).toFixed(3)})`
        context.lineWidth = 0.65
        context.beginPath()
        context.moveTo(point.x - flareLength, point.y)
        context.lineTo(point.x + flareLength, point.y)
        context.moveTo(point.x, point.y - flareLength)
        context.lineTo(point.x, point.y + flareLength)
        context.stroke()

        context.fillStyle = `rgba(255, 255, 255, ${(glintPower * factor).toFixed(3)})`
        context.beginPath()
        context.arc(point.x, point.y, 1.2 * glintPower, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }
    }

    state.handle = requestAnimationFrame(render)
  }

  const attach = (canvas: HTMLCanvasElement, container: HTMLElement) => {
    state.canvas = canvas
    state.container = container
    state.context = canvas.getContext("2d")
    resize()
    window.addEventListener("resize", resize)
    container.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mouseup", onMouseUp)
    window.addEventListener("mousemove", onMouseMove)
  }

  const start = () => {
    cancelAnimationFrame(state.handle)
    state.handle = requestAnimationFrame(render)
  }

  const stop = () => {
    cancelAnimationFrame(state.handle)
    state.handle = 0
  }

  const poke = () => {
    state.typingImpulse = 2.5
    state.targetRotY += 0.65
    for (const node of nodes) node.glintBoost = 1.2
  }

  const noteTyping = () => {
    state.typingImpulse = Math.min(2.5, state.typingImpulse + 0.45)
    state.targetRotX += (Math.random() - 0.5) * 0.12
    state.targetRotY += (Math.random() - 0.5) * 0.2
    for (const node of nodes) {
      if (Math.random() < 0.25) node.glintBoost = 1.0
    }
  }

  const setWordCount = (count: number) => {
    state.wordCount = count
  }

  return { attach, start, stop, poke, noteTyping, setWordCount }
}
