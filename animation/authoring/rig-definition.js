export const IMAGE = { width: 1774, height: 887 };

// Joint coordinates belong to the accepted source image, in pixels, y down.
export const JOINTS = [
  { name: 'root', parent: null, point: [887, 866], limit: 1.2 },
  { name: 'spine', parent: 'root', point: [887, 680], limit: 1.4 },
  { name: 'chest', parent: 'spine', point: [887, 365], limit: 1.2 },
  { name: 'neck', parent: 'chest', point: [887, 333], limit: 2 },
  { name: 'head', parent: 'neck', point: [887, 315], limit: 5 },
  { name: 'head.end', parent: 'head', point: [887, 100], limit: 0 },
  { name: 'tongue', parent: 'head', point: [887, 254], limit: 4 },
  { name: 'tongue.tip', parent: 'tongue', point: [887, 267], limit: 4 },
  { name: 'tongue.end', parent: 'tongue.tip', point: [887, 280], limit: 0 },
  { name: 'left.upper', parent: 'chest', point: [706, 368], limit: 12 },
  { name: 'left.forearm', parent: 'left.upper', point: [409, 441], limit: 15 },
  { name: 'left.hand', parent: 'left.forearm', point: [194, 444], limit: 10 },
  { name: 'right.upper', parent: 'chest', point: [1068, 368], limit: 12 },
  { name: 'right.forearm', parent: 'right.upper', point: [1362, 444], limit: 15 },
  { name: 'right.hand', parent: 'right.forearm', point: [1598, 445], limit: 10 },
];

export const FINGERS = [
  { name: 'left.thumb', hand: 'left.hand', points: [[173, 415], [153, 372], [133, 328]], radius: 18 },
  { name: 'left.index', hand: 'left.hand', points: [[128, 410], [84, 389], [41, 374]], radius: 12 },
  { name: 'left.middle', hand: 'left.hand', points: [[116, 432], [69, 417], [23, 408]], radius: 12 },
  { name: 'left.ring', hand: 'left.hand', points: [[118, 452], [70, 447], [25, 439]], radius: 11 },
  { name: 'left.little', hand: 'left.hand', points: [[125, 468], [86, 473], [47, 475]], radius: 11 },
  { name: 'right.index', hand: 'right.hand', points: [[1654, 404], [1692, 368], [1730, 332]], radius: 14 },
  { name: 'right.middle', hand: 'right.hand', points: [[1670, 428], [1715, 414], [1760, 398]], radius: 13 },
];

for (const finger of FINGERS) {
  JOINTS.push(
    { name: finger.name, parent: finger.hand, point: finger.points[0], limit: 5 },
    { name: finger.name + '.tip', parent: finger.name, point: finger.points[1], limit: 7 },
    { name: finger.name + '.end', parent: finger.name + '.tip', point: finger.points[2], limit: 0 },
  );
}

export const INDEX = Object.fromEntries(JOINTS.map((joint, index) => [joint.name, index]));
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function segmentDistance(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return { distance: Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy), t };
}

function compactWeights(entries) {
  const merged = new Map();
  for (const [name, weight] of entries) {
    if (weight > 0) merged.set(INDEX[name], (merged.get(INDEX[name]) ?? 0) + weight);
  }
  const result = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = result.reduce((sum, [, weight]) => sum + weight, 0);
  return result.map(([index, weight]) => [index, weight / total]);
}

export function weightsAt(x, y) {
  // The tongue has a local deformation region: lips/eyes stay bound to the head.
  if (y < 318 && x > 720 && x < 1055) {
    const ellipse = Math.hypot((x - 887) / 18, (y - 269) / 16);
    const influence = (1 - smooth(.5, 1, ellipse)) * smooth(253, 260, y) * .88;
    const tip = smooth(260, 276, y);
    return compactWeights([
      ['head', 1 - influence], ['tongue', influence * (1 - tip)], ['tongue.tip', influence * tip],
    ]);
  }
  if (y < 342 && x > 700 && x < 1080) {
    const head = 1 - smooth(316, 342, y);
    return compactWeights([['head', head], ['neck', 1 - head]]);
  }

  for (const side of ['left', 'right']) {
    const left = side === 'left';
    const armRegion = left ? x < 713 : x > 1061;
    if (!armRegion || y < 300 || y > 580) continue;
    const out = left ? 713 - x : x - 1061;
    const shoulder = smooth(0, 150, out);
    const forearm = smooth(left ? 235 : 245, left ? 340 : 365, out);
    const hand = smooth(left ? 478 : 490, left ? 537 : 559, out);
    if (hand > .01) {
      let nearest;
      for (const finger of FINGERS.filter(f => f.hand === side + '.hand')) {
        const proximal = segmentDistance([x, y], finger.points[0], finger.points[1]);
        const distal = segmentDistance([x, y], finger.points[1], finger.points[2]);
        const distance = Math.min(proximal.distance, distal.distance);
        if (distance > finger.radius || nearest && nearest.distance < distance) continue;
        const rootFade = smooth(0, .46, proximal.t);
        const mix = 1 - smooth(finger.radius * .65, finger.radius, distance);
        const influence = mix * (distal.distance < proximal.distance ? 1 : rootFade);
        const tip = smooth(0, .45, distal.t);
        nearest = { finger, distance, influence, tip };
      }
      if (nearest && nearest.influence > .001) {
        const { finger, influence, tip } = nearest;
        return compactWeights([
          [side + '.hand', 1 - influence], [finger.name, influence * (1 - tip)], [finger.name + '.tip', influence * tip],
        ]);
      }
    }
    return compactWeights([
      ['chest', 1 - shoulder],
      [side + '.upper', shoulder * (1 - forearm)],
      [side + '.forearm', shoulder * forearm * (1 - hand)],
      [side + '.hand', shoulder * forearm * hand],
    ]);
  }

  const chest = 1 - smooth(445, 760, y);
  const spine = smooth(445, 660, y) * (1 - smooth(690, 866, y));
  return compactWeights([['chest', chest], ['spine', (1 - chest) * spine], ['root', (1 - chest) * (1 - spine)]]);
}

export function limitedAngle(name, degrees) {
  const joint = JOINTS[INDEX[name]];
  if (!joint || !Number.isFinite(degrees)) throw new Error('Invalid joint angle: ' + name);
  return clamp(degrees, -joint.limit, joint.limit) * Math.PI / 180;
}

export function animationPose(mode, time, strength) {
  const a = clamp(strength, 0, 1), pose = {};
  const set = (name, value) => { pose[name] = value * a; };
  if (mode === 'rest') return pose;
  set('root', Math.sin(time * .47) * .18);
  set('spine', Math.sin(time * .65 + .8) * .3);
  set('chest', Math.sin(time * 1.18) * .18);
  set('neck', Math.sin(time * .53) * .35);
  set('head', Math.sin(time * .73) * (mode === 'head' ? 4.3 : 1.1));
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    set(side + '.upper', sign * (2.2 + Math.sin(time * .65) * .9));
    set(side + '.forearm', sign * Math.sin(time * .91 + .9) * 1.6);
    set(side + '.hand', Math.sin(time * 1.1 + sign) * (mode === 'hands' ? 6 : 1.4));
  }
  if (mode === 'wave') {
    set('left.upper', 4 + Math.sin(time * 1.4) * 2);
    set('left.forearm', Math.sin(time * 1.9) * 7);
    set('left.hand', Math.sin(time * 2.4) * 8);
  }
  for (let index = 0; index < FINGERS.length; index++) {
    const finger = FINGERS[index], phase = time * 1.8 + index * .42;
    set(finger.name, Math.sin(phase) * (mode === 'hands' ? 2.7 : .5));
    set(finger.name + '.tip', Math.sin(phase - .45) * (mode === 'hands' ? 4 : .8));
  }
  set('tongue', Math.sin(time * 1.7) * (mode === 'tongue' ? 3.2 : .8));
  set('tongue.tip', Math.sin(time * 2.1 + .6) * (mode === 'tongue' ? 3.4 : 1.1));
  return pose;
}
