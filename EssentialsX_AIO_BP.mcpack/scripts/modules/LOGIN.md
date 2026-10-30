# Login waiting area (v1.8.58)

Unauthenticated players can walk and look around. On entry, and once per second
when they move more than about 1.4 blocks from the anchor (including vertically)
or change dimension, they return to the server spawn. The destination uses the
same safe-ground search as `!spawn`: `!setspawn` when configured, otherwise the
world default spawn. If spawn terrain is not loaded or has no safe standing
space, their entry position remains the temporary anchor; resolution retries
each second. Configure a safe, loaded lobby with `!setspawn`.

Login applies no potion effects. Long-duration blindness/resistance matching the
older login implementation are removed when entering/leaving the waiting state;
ordinary short-duration potion effects are preserved. Movement/camera permissions
are released. Break/place, interaction, item use, chat and teleport restrictions
remain active until login; password handling, retries, timeout and bypass settings
are unchanged. Successful login releases the spawn tether.

Simulated event tests cover the waiting state; Minecraft device verification is
still required for native input, terrain loading and effect behavior.

## Login topbar notices (v1.8.63)

Login/Register prompts, the remaining-time reminder, successful authentication
and automatic login use the same top notification panel and marker as Quest
completion. The first line shows the login state and countdown; the second shows
the configured command prefix and login/register syntax. Reminder updates omit
the fade-in animation so the once-per-second countdown stays readable.
The previous central login titles and login actionbar reminder are replaced.
Forms and chat error messages retain their existing behavior. Quest notification
text/timing are preserved, and unavailable displays cannot interrupt account logic.

## Register and Welcome icons (v1.8.72)

The Register prompt and its countdown use a blue account card with a green plus.
Successful registration, password login and automatic login use a waving hand.
The registered-account Login prompt and Quest completion keep the original icon.
Icons occupy the existing 18×18 slot, with the same panel, text and timing.

The helper accepts an optional fifth `icon` argument (`register` or `welcome`).
Formatting-only suffix markers select resource-pack image controls and are removed
from displayed text. They do not use custom font glyphs. Unknown icon choices use
the original Quest icon. The resource pack is required for this layout.

Rebuild with `python3 tools/build-login-notice-icons.py` after installing Pillow
from `tools/rank-art-requirements.txt`. Run the notification/icon tests with
`node --test tests/notifications.test.mjs tests/login-notice-icons.test.mjs` and
asset checks with `python3 tests/login-notice-assets.test.py`.
Native Bedrock HUD appearance still requires checking on the target device.
