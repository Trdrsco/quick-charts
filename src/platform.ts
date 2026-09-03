// What the chart knows about the platform it runs on, asked once and stated here so every surface
// that names a key names the same one.

/** Whether the keyboard's command modifier is the Command key. A hint names the key this platform
 *  has, since the gestures and the keys accept Control and Command alike. */
export function isApplePlatform(): boolean {
  const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { userAgentData?: { platform?: string } })
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}
