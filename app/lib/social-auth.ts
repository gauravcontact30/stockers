import "server-only";

import type { SocialProvider } from "./auth-security";

export type SocialProfile = {
  id: string;
  email: string;
  name: string;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function providerConfig(provider: SocialProvider): ProviderConfig | null {
  if (provider === "google") {
    const clientId = env("GOOGLE_CLIENT_ID");
    const clientSecret = env("GOOGLE_CLIENT_SECRET");
    return clientId && clientSecret
      ? {
          clientId,
          clientSecret,
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          scope: "openid email profile",
        }
      : null;
  }

  if (provider === "facebook") {
    const clientId = env("FACEBOOK_CLIENT_ID");
    const clientSecret = env("FACEBOOK_CLIENT_SECRET");
    return clientId && clientSecret
      ? {
          clientId,
          clientSecret,
          authorizeUrl: "https://www.facebook.com/v20.0/dialog/oauth",
          tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
          scope: "email,public_profile",
        }
      : null;
  }

  const clientId = env("INSTAGRAM_CLIENT_ID");
  const clientSecret = env("INSTAGRAM_CLIENT_SECRET");
  return clientId && clientSecret
    ? {
        clientId,
        clientSecret,
        authorizeUrl: "https://api.instagram.com/oauth/authorize",
        tokenUrl: "https://api.instagram.com/oauth/access_token",
        scope: "user_profile",
      }
    : null;
}

export function socialProviderFrom(value: string): SocialProvider | null {
  return value === "google" || value === "facebook" || value === "instagram" ? value : null;
}

export function callbackUrl(origin: string, provider: SocialProvider): string {
  return `${origin}/api/auth/social/${provider}/callback`;
}

export async function exchangeSocialCode(params: {
  provider: SocialProvider;
  config: ProviderConfig;
  code: string;
  redirectUri: string;
}): Promise<SocialProfile> {
  const body = new URLSearchParams({
    client_id: params.config.clientId,
    client_secret: params.config.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch(params.config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenData = (await tokenResponse.json()) as Record<string, unknown>;
  if (!tokenResponse.ok || typeof tokenData.access_token !== "string") {
    throw new Error("Social provider did not return an access token.");
  }

  if (params.provider === "google") {
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileResponse.json()) as Record<string, unknown>;
    if (!profileResponse.ok || typeof profile.sub !== "string" || typeof profile.email !== "string") {
      throw new Error("Google profile did not include an email address.");
    }
    return {
      id: profile.sub,
      email: profile.email,
      name: typeof profile.name === "string" ? profile.name : profile.email,
    };
  }

  if (params.provider === "facebook") {
    const profileUrl = new URL("https://graph.facebook.com/v20.0/me");
    profileUrl.searchParams.set("fields", "id,name,email");
    profileUrl.searchParams.set("access_token", tokenData.access_token);
    const profileResponse = await fetch(profileUrl);
    const profile = (await profileResponse.json()) as Record<string, unknown>;
    if (!profileResponse.ok || typeof profile.id !== "string" || typeof profile.email !== "string") {
      throw new Error("Facebook profile did not include an email address.");
    }
    return {
      id: profile.id,
      email: profile.email,
      name: typeof profile.name === "string" ? profile.name : profile.email,
    };
  }

  const profileUrl = new URL("https://graph.instagram.com/me");
  profileUrl.searchParams.set("fields", "id,username");
  profileUrl.searchParams.set("access_token", tokenData.access_token);
  const profileResponse = await fetch(profileUrl);
  const profile = (await profileResponse.json()) as Record<string, unknown>;
  if (!profileResponse.ok || typeof profile.id !== "string") {
    throw new Error("Instagram profile did not include an account id.");
  }
  const username = typeof profile.username === "string" ? profile.username : profile.id;
  return {
    id: profile.id,
    email: `instagram-${profile.id}@social.stockersai.local`,
    name: username,
  };
}
