import * as THREE from 'three'

export const PORTRAIT = '/images/kunimen-portrait.png'
const WIDTH = 580
const HEIGHT = 960
const TOP = 320
const STEP = 8

const HAND = `M 351 783
 C 343 782 340 793 342 808 C 345 825 348 841 348 864
 C 348 904 349 946 351 980 C 354 1017 359 1048 356 1067
 C 353 1080 349 1089 345 1094 C 335 1090 330 1076 321 1061
 C 302 1033 280 1001 260 978 C 241 956 223 931 209 908
 C 202 894 195 885 188 888 C 178 890 173 906 176 918
 C 179 933 192 948 205 963 C 228 990 248 1016 268 1044
 C 287 1070 302 1096 316 1125 C 327 1147 333 1170 313 1196
 C 300 1195 286 1197 275 1201 C 254 1208 248 1229 251 1252
 L 252 1280 L 449 1280 C 443 1239 436 1196 426 1158
 C 417 1123 411 1090 408 1055 C 405 1022 402 993 397 967
 C 391 934 383 906 377 878 C 369 847 365 823 362 804
 C 361 791 358 783 351 783 Z`

export function createPortraitGeometry() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.translate(0, -TOP)
  context.filter = 'blur(7px)'
  context.fillStyle = 'white'
  context.fill(new Path2D(HAND))
  const mask = context.getImageData(0, 0, WIDTH, HEIGHT).data
  const positions: number[] = []
  const uv: number[] = []
  const weights: number[] = []
  const indices: number[] = []
  const cols = Math.ceil(WIDTH / STEP)
  const rows = Math.ceil(HEIGHT / STEP)

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = col / cols * WIDTH
      const y = row / rows * HEIGHT
      const sourceY = y + TOP
      const alpha = mask[(Math.min(HEIGHT - 1, Math.floor(y)) * WIDTH + Math.min(WIDTH - 1, Math.floor(x))) * 4 + 3] / 255
      const isIndex = THREE.MathUtils.smoothstep(x - (sourceY * 0.45 - 150), -12, 12)
      const head = 1 - THREE.MathUtils.smoothstep(sourceY, 870, 1160)
      positions.push(x - WIDTH / 2, HEIGHT / 2 - y, 0)
      uv.push(x / WIDTH, 1 - y / HEIGHT)
      weights.push(head * (1 - alpha * 0.8), alpha, alpha * isIndex, alpha * (1 - isIndex))
      if (row < rows && col < cols) {
        const a = row * (cols + 1) + col
        indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geometry.setAttribute('rigWeight', new THREE.Float32BufferAttribute(weights, 4))
  geometry.setIndex(indices)
  return geometry
}

// The whole portrait shares one continuous mesh: blended bone weights keep the
// neck and overlapping hand attached without duplicate fingers or cutout gaps.
export const portraitVertex = `
  attribute vec4 rigWeight;
  uniform float uTime;
  uniform float uMotion;
  uniform float uNear;
  uniform float uEnergy;
  uniform vec2 uPointer;
  varying vec2 vUv;

  vec2 turn(vec2 p, vec2 pivot, float angle) {
    float c = cos(angle), s = sin(angle);
    return pivot + mat2(c, s, -s, c) * (p - pivot);
  }
  vec2 joint(vec2 p, vec2 original, vec2 pivot, float angle, float weight) {
    float blend = 1.0 - smoothstep(pivot.y - 24.0, pivot.y + 25.0, original.y);
    return turn(p, pivot, angle * weight * blend);
  }
  void main() {
    vUv = uv;
    vec2 original = vec2(position.x + 290.0, 800.0 - position.y);
    vec2 p = original;
    float t = uTime;
    float strength = uMotion * (0.22 + uNear * 0.66 + uEnergy * 0.25);
    float wave = sin(t * 2.5);
    float reply = uPointer.x * uNear;

    p = joint(p, original, vec2(354.0, 866.0), (sin(t * 2.5 - 0.6) * 0.095 + reply * 0.07) * strength, rigWeight.z);
    p = joint(p, original, vec2(372.0, 977.0), (sin(t * 2.5 - 0.3) * 0.10 + reply * 0.04) * strength, rigWeight.z);
    p = joint(p, original, vec2(378.0, 1106.0), wave * 0.045 * strength, rigWeight.z);
    p = joint(p, original, vec2(218.0, 949.0), sin(t * 2.5 + 0.8) * 0.075 * strength, rigWeight.w);
    p = joint(p, original, vec2(268.0, 1020.0), sin(t * 2.5 + 0.5) * 0.08 * strength, rigWeight.w);
    p = joint(p, original, vec2(327.0, 1109.0), (sin(t * 2.5 + 0.3) * 0.04 - reply * 0.03) * strength, rigWeight.w);

    float handAngle = (sin(t * 1.25 + 0.8) * 0.009 + reply * 0.022) * uMotion;
    p = turn(p, vec2(377.0, 1260.0), handAngle * rigWeight.y);

    float headAngle = (sin(t * 0.8) * 0.009 + reply * 0.045 + sin(t * 5.0) * uEnergy * 0.008) * uMotion;
    p = turn(p, vec2(282.0, 1050.0), headAngle * rigWeight.x);
    p += vec2(uPointer.x * 10.0, uPointer.y * 9.0 + sin(t * 1.25) * 2.8) * uNear * rigWeight.x * uMotion;

    float bodyWeight = 1.0 - smoothstep(790.0, 1280.0, original.y);
    float bodyAngle = (sin(t * 0.65 + 0.6) * 0.004 + reply * 0.012) * uMotion;
    p = turn(p, vec2(290.0, 1275.0), bodyAngle);
    p.y -= (sin(t * 1.45) * 3.5 + uNear * 3.0) * bodyWeight * uMotion;

    vec3 transformed = vec3(p.x - 290.0, 800.0 - p.y, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`

export const portraitFragment = `
  uniform sampler2D uTexture;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    color.a *= smoothstep(0.0, 0.085, vUv.y);
    if (color.a < 0.005) discard;
    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
