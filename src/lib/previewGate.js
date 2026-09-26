/* What testers can reach on the hosted site, and what they cannot.
 *
 * The operator is handing kaizerx.com to other people so they can CONNECT
 * THEIR YOUTUBE CHANNELS. Everything else is half-built, mid-migration, or
 * simply not what he wants judged yet -- and a tester who wanders into an
 * unfinished screen reports that instead of doing the one thing that was
 * asked of them.
 *
 * There is a second reason, and it is the sharper one. Google's OAuth
 * verification for this project is pending, and the project carries a
 * 100-user lifetime cap that CANNOT be reset. Every grant is spent forever.
 * So the site should lead a tester to the channel connect and nowhere else.
 *
 * ONE LIST, TWO ENFORCEMENTS. The nav hides what is off; the router refuses
 * it as well. Hiding alone is not a gate -- the routes are public paths and
 * anyone who types one, or follows a stale bookmark, walks straight in.
 *
 * TO LIFT IT: set VITE_PREVIEW_MODE=0 at build time, or empty ALLOWED here.
 * Nothing else changes; every page stays exactly where it was.
 */

/* Preview mode is ON unless the build explicitly turns it off. Defaulting
 * the OTHER way would mean a forgotten env var silently exposes everything,
 * which is the failure that matters. */
export const PREVIEW_MODE =
  String(import.meta.env?.VITE_PREVIEW_MODE ?? "1").trim() !== "0";

/* Reachable without signing in. Trimming these would lock a tester out of
 * the product before they reach the part being tested. */
export const PUBLIC_PATHS = [
  "/", "/login", "/register", "/forgot-password", "/reset-password",
  "/privacy", "/terms", "/desktop", "/desktop/eula",
];

/* What a tester came here to do, plus what Google's reviewer has to be able
 * to see.
 *
 * THE SECOND HALF IS NOT COSMETIC. The OAuth verification submission carries
 * a demo video showing this app read a channel's catalogue, publish to it,
 * attach a thumbnail and go live. If a reviewer then opens the live site and
 * finds those same screens answering "this feature is locked for now", the
 * app on the internet does not do what the submission says it does -- and
 * that is a fair reason to reject it. So everything the video demonstrates
 * is reachable here, and nothing else is.
 *
 * REVERTING: once verification lands, drop the four marked `for the review`
 * and the preview narrows back to channel-connect. Nothing else changes. */
export const ALLOWED = [
  "/channels",      // Accounts -- the CHANNEL CONNECT page (YouTubeAccountsPanel)
  "/live-studio",   // Live Studio -- and the liveBroadcasts/liveStreams scopes
  "/uploads",       // Uploads
  "/settings",      // their own account: name, avatar, password

  // for the review -- the surfaces the demo video shows:
  "/app",           // the job list, and the way into a job
  "/library",       // finished videos -> the publish flow
  "/quick-publish", // per-channel SEO generated from the channel's catalogue
  "/performance",   // Insights & SEO -- build_channel_profile reading it back

  // The admin console. AdminRoute already refuses non-admins with a 403
  // and every endpoint behind it is Depends(auth.admin_required); the
  // gate was simply refusing everybody, admins included.
  "/admin",
  "/help",
];

/* Where a signed-in tester lands, and where the logo goes.
 *
 * Without this the preview is unusable: login redirected to /library and
 * the logo linked to /app -- BOTH blocked -- so every tester signed in and
 * hit the refusal page, and the one thing they were asked to do was two
 * clicks away behind a wall. */
export const HOME_PATH = PREVIEW_MODE ? "/channels" : "/app";

/** Does this path survive the gate? Prefix-matched, so /uploads/42 rides
 *  in on /uploads and a sub-route never has to be listed twice. */
/* Paths this gate must never block, whatever ALLOWED says.
 *
 * /onboarding is where an un-onboarded account is sent, and the only place
 * the form can be submitted. If the preview gate ever refuses it the account
 * is walled off with no way out: every path redirects here, this page is
 * refused, and the refusal page's own link redirects back. No POST can be
 * issued, so the state is permanent.
 *
 * It lives here rather than in ALLOWED deliberately. The header above tells
 * people to trim ALLOWED, and one line too many would cause exactly that
 * lockout. Editing a list must not be able to strand a user. */
const NEVER_BLOCKED = ["/onboarding"];

export function allowed(pathname) {
  if (!PREVIEW_MODE) return true;
  const p = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (PUBLIC_PATHS.includes(p)) return true;
  if (NEVER_BLOCKED.some((a) => p === a || p.startsWith(a + "/"))) return true;
  return ALLOWED.some((a) => p === a || p.startsWith(a + "/"));
}

/** For the nav: keep an item only if its destination is reachable. */
export function navAllowed(to) {
  return allowed(to);
}

/* Shown in place of a blocked page. A tester who hits one should know it is
 * deliberate and that nothing is broken -- otherwise they file it as a bug,
 * which wastes their time and the operator's. */
export const BLOCKED_TITLE = "Not part of this preview";
export const BLOCKED_BODY =
  "This build is for connecting a YouTube channel, going live, and " +
  "reviewing uploads. The rest of Kaizer X is switched off here — " +
  "nothing is broken.";
