import type { Translation } from '@trdrs/i18n'
import type { en } from '../en'
import { legend } from './legend'
import { tools } from './tools'
import { rail } from './rail'
import { ticket } from './ticket'
import { account } from './account'
import { menu } from './menu'
import { lines } from './lines'
import { replay } from './replay'
import { inputs } from './inputs'
import { broker } from './broker'
import { session } from './session'
import { layouts } from './layouts'
import { marks } from './marks'
import { host } from './host'

const dict: Translation<typeof en> = { ...legend, ...tools, ...rail, ...ticket, ...account, ...menu, ...lines, ...replay, ...inputs, ...broker, ...session, ...layouts, ...marks, ...host }
export default dict
