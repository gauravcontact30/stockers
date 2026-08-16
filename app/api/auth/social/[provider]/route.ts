import { NextResponse } from "next/server";
import { createOAuthState } from "../../../../lib/auth-security";
import { appOrigin } from "../../../../lib/mailer";
import { callbackUrl, providerConfig, socialProviderFrom } from "../../../../lib/social-auth";

const STATE_COOKIE = "stockers_oauth_state";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: rawProvider } = await context.params;
  const provider = socialProviderFrom(rawProvider);
  if (!provider) return NextResponse.redirect(`${appOrigin()}/signin?social=unknown&error=unsupported_provider`);

  const config = providerConfig(provider);
  if (!config) return NextResponse.redirect(`${appOrigin()}/signin?social=${provider}&error=social_config_missing`);

  const state = createOAuthState(provider);
  const authorize = new URL(config.authorizeUrl);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl(appOrigin(), provider));
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", config.scope);
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appOrigin().startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
