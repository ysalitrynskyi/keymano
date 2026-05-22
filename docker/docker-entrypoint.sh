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

# Paths default to the in-container locations; the KEYMANO_* / NGINX_BIN
# overrides exist only so the rendering logic can be exercised in a test
# harness (see src/test/deploy-csp.test.ts). They are never set in the image,
# so container behaviour is unchanged.
TMPL_CONF="${KEYMANO_TMPL_CONF:-/etc/keymano/nginx.conf.tmpl}"
OUT_CONF="${KEYMANO_OUT_CONF:-/etc/nginx/conf.d/default.conf}"
TMPL_HTML="${KEYMANO_TMPL_HTML:-/etc/keymano/index.html.tmpl}"
OUT_HTML="${KEYMANO_OUT_HTML:-/usr/share/nginx/html/index.html}"
ANALYTICS_JS="${KEYMANO_ANALYTICS_JS:-/usr/share/nginx/html/analytics.js}"
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

# Cloudflare Web Analytics: when the site is fronted by Cloudflare with
# automatic RUM enabled, the CF edge injects beacon.min.js into the response
# *after* it leaves nginx (we never add it to the HTML). That script — and the
# data POST it makes — needs the CF origins allowed in the CSP, otherwise the
# browser blocks it and logs a console error. Off by default to preserve the
# same-origin promise; set CLOUDFLARE_WEB_ANALYTICS to a non-empty value on a
# Cloudflare-fronted deployment to allow the beacon. (If you'd rather not run
# CF analytics at all, leave this unset and disable the automatic beacon in the
# Cloudflare Web Analytics dashboard instead.)
CF="${CLOUDFLARE_WEB_ANALYTICS:-}"
if [ -n "$CF" ]; then
    echo "keymano: Cloudflare Web Analytics CSP allowance ENABLED."
    CSP_SCRIPT="${CSP_SCRIPT:+$CSP_SCRIPT }https://static.cloudflareinsights.com"
    CSP_CONNECT="${CSP_CONNECT:+$CSP_CONNECT }https://cloudflareinsights.com"
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
"${NGINX_BIN:-nginx}" -t

exec "$@"
