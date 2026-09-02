import type { Translation } from '../runtime'
import type { en } from '../en'
import { legend } from './legend'
import { tools } from './tools'
import { rail } from './rail'
import { menu } from './menu'
import { replay } from './replay'
import { inputs } from './inputs'
import { session } from './session'
import { layouts } from './layouts'
import { host } from './host'

const dict: Translation<typeof en> = { ...legend, ...tools, ...rail, ...menu, ...replay, ...inputs, ...session, ...layouts, ...host }
export default dict
