import { NextResponse } from "next/server";
import { recordEvent, visitorIdFromRequest } from "../../../../../lib/analytics";
import { verifyOAuthState } from "../../../../../lib/auth-security";
import { appOrigin } from "../../../../../lib/mailer";
import { recordPlatformLog } from "../../../../../lib/platform-logs";
import { callbackUrl, exchangeSocialCode, providerConfig, socialProviderFrom } from "../../../../../lib/social-auth";
import { createToken, findOrCreateSocialUser, SESSION_COOKIE } from "../../../../../lib/store";

const STATE_COOKIE = "stockers_oauth_state";

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function handoffHtml(payload: { token: string; user: unknown; next: string }) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Signing in...</title></head>
  <body>
    <script>
      const payload = ${escapeScriptJson(payload)};
      localStorage.setItem("stockers-auth", JSON.stringify({ token: payload.token, user: payload.user }));
      document.cookie = "stockers_session=" + encodeURIComponent(payload.token) + "; path=/; max-age=2592000; SameSite=Lax";
      window.location.replace(payload.next);
    </script>
  </body>
</html>`;
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  const provider = socialProviderFrom(rawProvider);
  if (!provider) return NextResponse.redirect(`${appOrigin()}/signin?social=unknown&error=unsupported_provider`);

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const cookieState = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${STATE_COOKIE}=`))
      ?.slice(STATE_COOKIE.length + 1);

    if (!code || !state || !cookieState || decodeURIComponent(cookieState) !== state || !verifyOAuthState(state, provider)) {
      return NextResponse.redirect(`${appOrigin()}/signin?social=${provider}&error=social_state_invalid`);
    }

    const config = providerConfig(provider);
    if (!config) return NextResponse.redirect(`${appOrigin()}/signin?social=${provider}&error=social_config_missing`);

    const profile = await exchangeSocialCode({
      provider,
      config,
      code,
      redirectUri: callbackUrl(appOrigin(), provider),
    });
    const user = await findOrCreateSocialUser({
      provider,
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
    });
    if (!user) return NextResponse.redirect(`${appOrigin()}/signin?social=${provider}&error=social_account_failed`);

    await recordEvent({
      type: "signin",
      userId: user.id,
      userEmail: user.email,
      visitorId: visitorIdFromRequest(request),
      userAgent: request.headers.get("user-agent"),
    });
    recordPlatformLog({
      category: "security",
      severity: "info",
      source: "Auth",
      useCase: "Security & Access: social login",
      operation: "signin.social_success",
      message: "User signed in with a federated provider.",
      statusCode: 200,
      userId: user.id,
      path: `/api/auth/social/${provider}/callback`,
      method: "GET",
      metadata: { provider, email: user.email },
    });

    const token = createToken(user);
    const publicUser = { id: user.id, name: user.name, email: user.email, plan: user.plan, mobile: user.mobile ?? null };
    const response = new NextResponse(handoffHtml({ token, user: publicUser, next: "/overview" }), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    response.cookies.set(SESSION_COOKIE, token, {
      sameSite: "lax",
      secure: appOrigin().startsWith("https://"),
      path: "/",
      maxAge: 2_592_000,
    });
    response.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(`${appOrigin()}/signin?social=${provider}&error=social_login_failed`);
  }
}
