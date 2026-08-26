// Market sessions and status: open, closed, electronic hours. Keyed by the session a timestamp
// classifies into, so a host reading `SESSION_LABEL` and a host reading the catalog say the same
// thing. Exchange timezone cities are place names and carry no key.
export const session = {
  'session.pre': 'Pre-market',
  'session.open': 'Market open',
  'session.eth': 'Electronic hours',
  'session.after': 'After-hours',
  'session.closed': 'Market closed',
} as const
