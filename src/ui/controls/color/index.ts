// The color control and the palette arithmetic behind it, internal to the package. Nothing here
// reaches a public entrypoint: it is the one implementation every color surface in the chart
// reuses, so no surface falls back to the operating system's own color dialog.
export * from './palette'
export * from './picker'
