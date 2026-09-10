import {
  MetaApiError,
  type ContainerStatus,
  type MetaDebugTokenResult,
  type MetaErrorClass,
  type MetaInstagramAccount,
  type MetaPage,
  type MetaProvider,
  type MetaScope,
  type MetaTokenInfo,
  type MetaUserProfile,
  type PublishedMedia,
  type ReelContainerInput,
} from "./types";

type GraphError = { error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string } };

/**
 * Real Meta Graph API client. Endpoints follow the Instagram Platform
 * (Content Publishing) and Facebook Pages (Reels) docs; the API version is
 * configurable so bumps don't require code changes.
 */
export class GraphMetaProvider implements MetaProvider {
  private readonly base: string;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    version: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `https://graph.facebook.com/${version}`;
  }

  buildAuthorizationUrl({ state, scopes, redirectUri }: { state: string; scopes: MetaScope[]; redirectUri: string }): string {
    const url = new URL(`https://www.facebook.com/${this.base.split("/").pop()}/dialog/oauth`);
    url.searchParams.set("client_id", this.appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    return url.toString();
  }

  async exchangeCodeForToken({ code, redirectUri }: { code: string; redirectUri: string }): Promise<MetaTokenInfo> {
    const data = await this.get<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: redirectUri,
      code,
    });
    return { accessToken: data.access_token, tokenType: "bearer", expiresAt: expiresFrom(data.expires_in), scopes: [] };
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenInfo> {
    const data = await this.get<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });
    return { accessToken: data.access_token, tokenType: "bearer", expiresAt: expiresFrom(data.expires_in), scopes: [] };
  }

  async debugToken(token: string): Promise<MetaDebugTokenResult> {
    const data = await this.get<{ data: { is_valid: boolean; scopes?: string[]; expires_at?: number; user_id?: string } }>("/debug_token", {
      input_token: token,
      access_token: `${this.appId}|${this.appSecret}`,
    });
    return {
      isValid: data.data.is_valid,
      scopes: data.data.scopes ?? [],
      expiresAt: data.data.expires_at ? new Date(data.data.expires_at * 1000) : null,
      userId: data.data.user_id ?? null,
    };
  }

  async getUserProfile(token: string): Promise<MetaUserProfile> {
    const data = await this.get<{ id: string; name?: string }>("/me", { fields: "id,name", access_token: token });
    return { id: data.id, name: data.name ?? null };
  }

  async listManagedPages(token: string): Promise<MetaPage[]> {
    const pages: MetaPage[] = [];
    let url: string | null = `${this.base}/me/accounts`;
    let params: Record<string, string> | undefined = {
      fields: "id,name,access_token,tasks,picture{url},instagram_business_account",
      limit: "100",
      access_token: token,
    };
    while (url) {
      const data: {
        data: { id: string; name: string; access_token: string; tasks?: string[]; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string } }[];
        paging?: { next?: string };
      } = await this.request(url, params);
      for (const p of data.data) {
        pages.push({
          id: p.id,
          name: p.name,
          accessToken: p.access_token,
          tasks: p.tasks ?? [],
          pictureUrl: p.picture?.data?.url ?? null,
          instagramBusinessAccountId: p.instagram_business_account?.id ?? null,
        });
      }
      url = data.paging?.next ?? null;
      params = undefined;
    }
    return pages;
  }

  async getInstagramAccountForPage(pageToken: string, pageId: string): Promise<MetaInstagramAccount | null> {
    const page = await this.get<{ instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } }>(`/${pageId}`, {
      fields: "instagram_business_account{id,username,name,profile_picture_url}",
      access_token: pageToken,
    });
    const ig = page.instagram_business_account;
    if (!ig) return null;
    return { id: ig.id, username: ig.username ?? ig.id, name: ig.name ?? null, profilePictureUrl: ig.profile_picture_url ?? null, facebookPageId: pageId };
  }

  async revokeToken(token: string): Promise<void> {
    await this.request(`${this.base}/me/permissions`, { access_token: token }, "DELETE").catch(() => undefined);
  }

  async createInstagramReelContainer({ igUserId, pageToken, input }: { igUserId: string; pageToken: string; input: ReelContainerInput }): Promise<{ containerId: string }> {
    const data = await this.post<{ id: string }>(`/${igUserId}/media`, {
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: String(input.shareToFeed ?? true),
      access_token: pageToken,
    });
    return { containerId: data.id };
  }

  async getContainerStatus({ containerId, pageToken }: { containerId: string; pageToken: string }): Promise<{ status: ContainerStatus; errorMessage?: string }> {
    const data = await this.get<{ status_code?: ContainerStatus; status?: string }>(`/${containerId}`, { fields: "status_code,status", access_token: pageToken });
    return { status: data.status_code ?? "IN_PROGRESS", errorMessage: data.status_code === "ERROR" ? data.status : undefined };
  }

  async publishInstagramContainer({ igUserId, containerId, pageToken }: { igUserId: string; containerId: string; pageToken: string }): Promise<PublishedMedia> {
    const data = await this.post<{ id: string }>(`/${igUserId}/media_publish`, { creation_id: containerId, access_token: pageToken });
    const media = await this.get<{ permalink?: string }>(`/${data.id}`, { fields: "permalink", access_token: pageToken }).catch(() => ({ permalink: undefined }));
    return { id: data.id, permalink: media.permalink ?? null };
  }

  async getInstagramPublishingLimit({ igUserId, pageToken }: { igUserId: string; pageToken: string }): Promise<{ used: number; quota: number }> {
    const data = await this.get<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(`/${igUserId}/content_publishing_limit`, {
      fields: "quota_usage,config",
      access_token: pageToken,
    });
    const row = data.data?.[0];
    return { used: row?.quota_usage ?? 0, quota: row?.config?.quota_total ?? 0 };
  }

  /**
   * Facebook Reels: start upload session → hosted-file upload via rupload →
   * finish with caption. Three calls per the Pages Reels publishing API.
   */
  async publishFacebookPageReel({ pageId, pageToken, input }: { pageId: string; pageToken: string; input: ReelContainerInput }): Promise<PublishedMedia> {
    const start = await this.post<{ video_id: string; upload_url?: string }>(`/${pageId}/video_reels`, { upload_phase: "start", access_token: pageToken });
    const videoId = start.video_id;

    const uploadRes = await this.fetchImpl(`https://rupload.facebook.com/video-upload/${this.base.split("/").pop()}/${videoId}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${pageToken}`, file_url: input.videoUrl },
    });
    const uploadBody = (await uploadRes.json().catch(() => ({}))) as { success?: boolean } & GraphError;
    if (!uploadRes.ok || uploadBody.success === false) throw toMetaError(uploadBody, uploadRes.status);

    for (let i = 0; i < 60; i++) {
      const st = await this.get<{ status?: { video_status?: string; uploading_phase?: { status?: string }; processing_phase?: { status?: string; error?: { message?: string } } } }>(`/${videoId}`, {
        fields: "status",
        access_token: pageToken,
      });
      const up = st.status?.uploading_phase?.status;
      const proc = st.status?.processing_phase?.status;
      if (proc === "error" || up === "error") throw new MetaApiError(st.status?.processing_phase?.error?.message ?? "Facebook could not process this video.", "MEDIA_PROCESSING_FAILED", false);
      if (up === "complete") break;
      await sleep(3000);
    }

    await this.post(`/${pageId}/video_reels`, {
      upload_phase: "finish",
      video_id: videoId,
      video_state: "PUBLISHED",
      description: input.caption,
      access_token: pageToken,
    });
    const info = await this.get<{ permalink_url?: string }>(`/${videoId}`, { fields: "permalink_url", access_token: pageToken }).catch(() => ({ permalink_url: undefined }));
    return { id: videoId, permalink: info.permalink_url ? `https://www.facebook.com${info.permalink_url}` : null };
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    return this.request<T>(`${this.base}${path}`, params);
  }

  private post<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
    return this.request<T>(`${this.base}${path}`, params, "POST");
  }

  private async request<T>(url: string, params?: Record<string, string>, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T> {
    let target = url;
    let body: URLSearchParams | undefined;
    if (params) {
      if (method === "POST") body = new URLSearchParams(params);
      else {
        const u = new URL(url);
        Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
        target = u.toString();
      }
    }
    let res: Response;
    try {
      res = await this.fetchImpl(target, { method, body, headers: body ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined });
    } catch (e) {
      throw new MetaApiError(`Network error contacting Meta: ${e instanceof Error ? e.message : "unknown"}`, "META_TEMPORARY_OUTAGE", true);
    }
    const json = (await res.json().catch(() => ({}))) as T & GraphError;
    if (!res.ok || json.error) throw toMetaError(json, res.status);
    return json;
  }
}

function expiresFrom(seconds?: number): Date | null {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map Graph error codes to our retry classes. Reference: Graph API error codes doc. */
export function toMetaError(body: GraphError, httpStatus: number): MetaApiError {
  const err = body.error ?? {};
  const code = err.code;
  const sub = err.error_subcode;
  const msg = err.error_user_msg || err.message || `Meta API error (HTTP ${httpStatus})`;
  let cls: MetaErrorClass = "UNKNOWN";
  let retryable = false;
  if (code === 190 || sub === 463 || sub === 467 || sub === 460) cls = "TOKEN_EXPIRED";
  else if (code === 10 || (code !== undefined && code >= 200 && code <= 299) || code === 200) cls = "PERMISSION_MISSING";
  else if (code === 4 || code === 17 || code === 32 || code === 613 || code === 9 || httpStatus === 429) {
    cls = "RATE_LIMITED";
    retryable = true;
  } else if (code === 368 || code === 1349125 || code === 1404078) cls = "ACCOUNT_RESTRICTED";
  else if (code === 100 || code === 36000 || code === 36001 || code === 36003 || code === 9007 || sub === 2207026) cls = "VALIDATION";
  else if (code === 9004 || code === 352 || code === 9001 || code === 9003 || sub === 2207053) cls = "MEDIA_PROCESSING_FAILED";
  else if (code === 1 || code === 2 || err.is_transient || httpStatus >= 500) {
    cls = "META_TEMPORARY_OUTAGE";
    retryable = true;
  }
  return new MetaApiError(msg, cls, retryable, code, sub);
}
