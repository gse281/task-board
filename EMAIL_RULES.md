# Email run — extra rules (Roni)

The "📬 Email run" routine reads this file every run. These rules add to / override its prompt.

1. **Summary leads with the key fact.** First words = the single most important thing: amount, due date, deadline, or who needs what. ≤ 25 words (money alerts up to ~60).
2. **Balances on money alerts.** Citi, Amex, Chase, Apple Card, any bank/card/lender alert: read the body and include the current balance / statement balance / available credit and minimum payment + due date whenever the email shows them. Format: "… · Balance $X · Avail $Y · Min $Z due Nov 4".
3. **COVE reports get a highlight.** Any COVE report (sales, traffic, leads, marketing, broker, weekly/daily reports — Cove Miami/Edgewater, Elliman, M18 PR): read the body and start the Summary with "★ " + the one standout fact, ending with " · " — e.g. "★ 2 new contracts (#1204, #905), $3.1M · 14 showings, 38 leads". Pick what changed or matters most: contracts/sales, price changes, big drops or jumps, problems.
4. **Chase alerts: summarize every transaction.** Every Chase email (alerts, wires, ACH, Zelle, debit/credit card, ATM, balance): read the full body of every message and put each transaction in the Summary as "Payee $amount (xLAST4, date)" joined by " · ", then the balance if shown. Never write "Chase alert", "transaction notice" or "large purchase approved" without the payee and amount. Chase "secure message" emails have no details — say so and give the title.
