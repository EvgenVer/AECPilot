"""T53 (UR47): how the core reads and applies ``gateway.bot_loop_guard`` for a profile.

Run with the core's own Python and ``HERMES_HOME`` set to a temporary profile copy. Prints
one JSON line: the settings the core loads from that profile's config.yaml, and the states
its loop guard returns for one human message followed by bot messages until the guard ends
the exchange. No model, no network, nothing written.
"""

import json

from gateway.bot_loop_guard import BotLoopGuard, load_settings


def main() -> None:
    settings = load_settings()
    guard = BotLoopGuard()
    conversation = ("room", "t53-check")
    states = [guard.chain_admit(conversation, "user:owner", "start", is_bot=False)[1]]
    for hop in range(settings.max_hops + 2):
        sender = "bot:smeta" if hop % 2 == 0 else "bot:konstruktor"
        allowed, state = guard.chain_admit(conversation, sender, f"reply {hop}", is_bot=True)
        states.append(state)
        if not allowed:
            break
    print(
        json.dumps(
            {
                "enabled": settings.enabled,
                "max_hops": settings.max_hops,
                "states": states,
            }
        )
    )


if __name__ == "__main__":
    main()
