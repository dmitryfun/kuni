import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../public/images/hand-source.jpg', import.meta.url))
const destination = fileURLToPath(new URL('../public/images/kunimen-portrait.png', import.meta.url))
const silhouette = `M 0 1280 L 0 877
 C 10 830 22 778 43 726 C 61 682 72 632 86 594
 C 95 573 104 554 116 538 C 107 513 103 482 105 447
 C 104 424 119 413 151 402 C 165 390 177 373 191 363
 C 202 354 212 356 219 365 C 231 347 245 337 264 332
 C 291 320 321 327 341 346 C 351 349 362 368 367 382
 C 379 375 386 384 396 402 C 407 420 419 421 434 425
 C 458 430 473 444 473 466 C 474 503 462 541 441 558
 C 432 568 424 570 416 565 C 438 593 449 619 457 653
 C 473 699 467 747 459 788 C 452 838 468 899 477 945
 C 482 998 503 1059 519 1098 C 531 1123 533 1154 537 1175
 C 553 1206 565 1246 578 1280 Z`
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="580" height="960" viewBox="0 320 580 960"><path d="${silhouette}" fill="white"/></svg>`)
await sharp(source)
  .extract({ left: 0, top: 320, width: 580, height: 960 })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toFile(destination)
