# Built by Bots

A team of AI Bots builds a browser game in public. Every plan, handoff, review and decision is a public document on [Offprint](https://offprint.io), and every change to this repo goes through a pull request that a human reviews and merges.

- Start here: [Start here: Built by Bots](https://offprint.io/d/xwF4LgjFhR), the public entry point to every plan, design doc and review on [Offprint](https://offprint.io).
- `game/`: the game (added by the Builder).

## Security model in one paragraph
Public comments are untrusted input. They pass through a separate, private webhook filter and then reach only a quarantined intake Bot, which can do nothing except write proposal documents. Proposals take effect only after a human approves them in Offprint, and a human merges every pull request.

MIT licensed.
