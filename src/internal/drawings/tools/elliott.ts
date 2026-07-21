import { LabeledPolyline } from './patterns'

// The Elliott wave set: labeled zigzags whose vocabulary (numbers vs letters) IS the tool.
// Wave degree styling (minor/intermediate/…) refines label typography in a later pass; the
// counts and labels here match the standard notation.

/** Impulse 12345: six pivots (origin 0 + waves 1–5). */
export class ElliottImpulse extends LabeledPolyline {
  readonly type: string = 'elliott_impulse_wave'

  requiredAnchors(): number {
    return 6
  }

  protected labels(): readonly string[] {
    return ['0', '1', '2', '3', '4', '5']
  }
}

/** Correction ABC: origin + three corrective waves. */
export class ElliottCorrection extends LabeledPolyline {
  readonly type = 'elliott_correction'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['0', 'A', 'B', 'C']
  }
}

/** Triangle ABCDE: origin + five contracting waves. */
export class ElliottTriangle extends LabeledPolyline {
  readonly type = 'elliott_triangle_wave'

  requiredAnchors(): number {
    return 6
  }

  protected labels(): readonly string[] {
    return ['0', 'A', 'B', 'C', 'D', 'E']
  }
}

/** Double combo WXY. */
export class ElliottDoubleCombo extends LabeledPolyline {
  readonly type = 'elliott_double_combo'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['0', 'W', 'X', 'Y']
  }
}

/** Triple combo WXYXZ. */
export class ElliottTripleCombo extends LabeledPolyline {
  readonly type = 'elliott_triple_combo'

  requiredAnchors(): number {
    return 6
  }

  protected labels(): readonly string[] {
    return ['0', 'W', 'X', 'Y', 'X', 'Z']
  }
}
