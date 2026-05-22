#!/bin/sh
# Keymano web image entrypoint.
#
# Renders the nginx conf + index.html from the pristine templates baked into
# the image on every start, so the result is identical whether the container is
# freshly created or restarted (`docker restart` keeps the writable layer — we
# always render from the read-only templates, never edit in place).
#
# Optional analytics: if GA_MEASUREMENT_ID is set to a valid Google Analytics
# id (e.g. G-XXXXXXXXXX), the Google tag is injected into <head> and the CSP is
# widened to allow Google's analytics origins. Unset / empty (the default)
# serves a fully same-origin page with no analytics, no third-party script, and
# no cookie. Toggle it by setting the env var and restarting the container.
set -eu

TMPL_CONF="/etc/keymano/nginx.conf.tmpl"
OUT_CONF="/etc/nginx/conf.d/default.conf"
TMPL_HTML="/etc/keymano/index.html.tmpl"
OUT_HTML="/usr/share/nginx/html/index.html"
ANALYTICS_JS="/usr/share/nginx/html/analytics.js"
SNIPPET="$(mktemp)"
trap 'rm -f "$SNIPPET"' EXIT

GA="${GA_MEASUREMENT_ID:-}"

# Reject anything that isn't a plain GA id so the value can't break out of the
# HTML/JS context it's interpolated into (defence against a hostile env var).
if [ -n "$GA" ] && ! printf '%s' "$GA" | grep -Eq '^[A-Za-z0-9_-]+$'; then
    echo "keymano: GA_MEASUREMENT_ID '$GA' is not a valid id ([A-Za-z0-9_-]); analytics disabled." >&2
    GA=""
fi

if [ -n "$GA" ]; then
    echo "keymano: web analytics ENABLED (Google Analytics id: $GA)."
    CSP_SCRIPT="https://www.googletagmanager.com"
    CSP_CONNECT="https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com"
    CSP_IMG="https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com"
    # gtag init lives in a same-origin file so script-src 'self' covers it — no
    # 'unsafe-inline' is ever added to the CSP.
    cat > "$ANALYTICS_JS" <<JS
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA}');
JS
    cat > "$SNIPPET" <<HTML
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script src="/analytics.js"></script>
HTML
else
    echo "keymano: web analytics disabled (no GA_MEASUREMENT_ID); serving same-origin, cookie-free page."
    CSP_SCRIPT=""
    CSP_CONNECT=""
    CSP_IMG=""
    rm -f "$ANALYTICS_JS"
    : > "$SNIPPET"
fi

# Render the nginx conf (# delimiter — the substituted values contain '/').
sed -e "s#__CSP_SCRIPT_EXTRA__#${CSP_SCRIPT}#g" \
    -e "s#__CSP_CONNECT_EXTRA__#${CSP_CONNECT}#g" \
    -e "s#__CSP_IMG_EXTRA__#${CSP_IMG}#g" \
    "$TMPL_CONF" > "$OUT_CONF"

# Render index.html: swap the marker line for the snippet (or drop it). awk
# avoids sed's trouble with '/' and '&' in the replacement text.
awk -v f="$SNIPPET" '
    /<!--KEYMANO_ANALYTICS-->/ { while ((getline line < f) > 0) print line; next }
    { print }
' "$TMPL_HTML" > "$OUT_HTML"

# Fail fast on a malformed conf rather than serving a broken site.
nginx -t

exec "$@"
