import type { Point } from '../core/types'
import { fontOf } from '../render/canvas'
import { LabeledPolyline, type PillProps } from './patterns'

// The Elliott wave set: labeled zigzags whose vocabulary (numbers vs letters) IS the tool. The
// degree of a count sets how its labels are written, and the color is the wave's and the labels'.

/** The fifteen degrees of an Elliott wave count, largest first. */
export const ELLIOTT_DEGREES = [
  'supermillennium',
  'millennium',
  'submillennium',
  'grandSupercycle',
  'supercycle',
  'cycle',
  'primary',
  'intermediate',
  'minor',
  'minute',
  'minuette',
  'subminuette',
  'micro',
  'submicro',
  'minuscule',
] as const

export type ElliottDegree = (typeof ELLIOTT_DEGREES)[number]

/** A wave count's settings: whether the wave line runs through its pivots, and its degree. */
export type ElliottProps = PillProps & {
  /** The wave line through the pivots; off, the count stands on its labels alone. */
  showWave: boolean
  /** The degree of the count, which sets how each label is written. */
  degree: ElliottDegree
  /** Each pivot's number or letter as written, in a pill as a pattern's letters stand, in place of
   *  the degree's writing. */
  labelPills: boolean
}

const UPPER_ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' }
const LOWER_ROMAN: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v' }

/**
 * How a degree writes a label. The degrees stand in five threes, largest first: each three ringed,
 * in parentheses, then bare, the way the classic notation writes primary, intermediate and minor.
 * The threes write a wave's number and a corrective letter as: upper roman numerals and capitals
 * (supermillennium to submillennium), upper roman numerals and small letters (grand supercycle to
 * cycle), figures and capitals (primary to minor), lower roman numerals and small letters (minute to
 * subminuette), and figures and small letters (micro to minuscule).
 */
export function elliottLabel(base: string, degree: ElliottDegree): { text: string; ringed: boolean } {
  const index = Math.max(0, ELLIOTT_DEGREES.indexOf(degree))
  const three = Math.floor(index / 3)
  const place = index % 3
  let text = base
  if (/^[1-5]$/.test(base)) text = three <= 1 ? UPPER_ROMAN[base]! : three === 3 ? LOWER_ROMAN[base]! : base
  else if (/^[A-Z]$/.test(base)) text = three === 0 || three === 2 ? base : base.toLowerCase()
  return { text: place === 1 ? `(${text})` : text, ringed: place === 0 }
}

/** The shared body of the wave counts: the wave line where it is on, and each pivot's label in the
 *  wave's color, written as the count's degree writes it, standing off the line on the side away
 *  from the leg that reaches it. */
abstract class ElliottWave extends LabeledPolyline<ElliottProps> {
  protected override defaultProps(): ElliottProps {
    return { pillRadius: null, showWave: true, degree: 'intermediate', labelPills: false }
  }

  /** A format-2 count drew its line and each pivot's number or letter in a pill. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    super.keepSavedLook(saved)
    this._props = { ...this._props, showWave: true, labelPills: true }
  }

  protected override showsLine(): boolean {
    return this.props.showWave !== false
  }

  protected override paintLabels(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (this.props.labelPills) {
      super.paintLabels(ctx, points)
      return
    }
    const labels = this.labels()
    ctx.save()
    ctx.setLineDash([])
    ctx.font = fontOf(this.style)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = this.style.lineColor
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    const lift = this.style.fontSize
    for (let i = 0; i < points.length && i < labels.length; i++) {
      if (!labels[i]) continue
      const p = points[i]!
      const prev = points[i - 1] ?? points[i + 1]
      const y = p.y + (prev && prev.y > p.y ? -lift : lift)
      const { text, ringed } = elliottLabel(labels[i]!, this.props.degree)
      ctx.fillText(text, p.x, y)
      if (ringed) {
        ctx.beginPath()
        ctx.arc(p.x, y, Math.max(ctx.measureText(text).width / 2, this.style.fontSize / 2) + 3, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

/** Impulse 12345: six pivots, the origin and waves 1 to 5. */
export class ElliottImpulse extends ElliottWave {
  readonly type: string = 'elliott_impulse_wave'

  requiredAnchors(): number {
    return 6
  }

  protected labels(): readonly string[] {
    return ['0', '1', '2', '3', '4', '5']
  }
}

/** Correction ABC: the origin and three corrective waves. */
export class ElliottCorrection extends ElliottWave {
  readonly type = 'elliott_correction'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['0', 'A', 'B', 'C']
  }
}

/** Triangle ABCDE: the origin and five contracting waves. */
export class ElliottTriangle extends ElliottWave {
  readonly type = 'elliott_triangle_wave'

  requiredAnchors(): number {
    return 6
  }

  protected labels(): readonly string[] {
    return ['0', 'A', 'B', 'C', 'D', 'E']
  }
}

/** Double combo WXY. */
export class ElliottDoubleCombo extends ElliottWave {
  readonly type = 'elliott_double_combo'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['0', 'W', 'X', 'Y']
  }
}

/** Triple combo WXYXZ. */
export class ElliottTripleCombo extends ElliottWave {
  readonly type = 'elliott_triple_combo'

  requiredAnchors(): number {
    return 6
  }

  protected labels(): readonly string[] {
    return ['0', 'W', 'X', 'Y', 'X', 'Z']
  }
}
