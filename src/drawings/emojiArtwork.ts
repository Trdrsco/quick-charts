// The bundled artwork as one default export. The chart imports this module, never the JSON, so the
// chunk it becomes exports only `default`: a JSON module's chunk exports every key under its own
// string name, a syntax hosts building for older targets refuse.
import artwork from './emoji-artwork.json'

const drawings: Readonly<Record<string, string>> = artwork
export default drawings
