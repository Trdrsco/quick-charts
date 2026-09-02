// The MONEY stand-in. A forecasting tool writes a position's P&L and the amount at its target or
// stop; those are money in the account's currency, not prices on the symbol's grid, so they do
// not go through the host's price-format port (a Treasury position would otherwise read its
// P&L in thirty-seconds). Until a money formatter port exists on the drawings package, money is
// written at two decimals: a DECLARED policy, the same for every magnitude and every symbol,
// never a rule read off the value.

/** A money amount at the declared two decimals, with its sign. */
export function moneyText(value: number): string {
  return value.toFixed(2)
}
