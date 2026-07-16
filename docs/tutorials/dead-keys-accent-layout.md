# Dead keys and accent layouts

Dead keys enter a state instead of typing immediately. The next key completes the sequence.

Example: a key outputs the state `acute`; pressing `a` afterward can produce `á`.

Workflow:

1. Select the key that should become the accent key.
2. Open **Dead Keys**.
3. Use **Accent recipe starter** to create a state id and terminator.
4. Return to **Editor** and assign composed outputs to the keys you need.
5. Use **Dead-key graph** to confirm states, transitions, and unreachable states.
6. Validate before export.

Keep state ids short, ASCII, and descriptive: `acute`, `grave`, `umlaut`, `tilde`.
