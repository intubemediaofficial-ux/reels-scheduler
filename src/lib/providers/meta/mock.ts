import type {
  ContainerStatus,
  MetaDebugTokenResult,
  MetaInstagramAccount,
  MetaPage,
  MetaProvider,
  MetaScope,
  MetaTokenInfo,
  MetaUserProfile,
  PublishedMedia,
  ReelContainerInput,
} from "./types";
import { MetaApiError } from "./types";

/**
 * Deterministic sandbox so the whole connect → schedule → publish flow can be
 * exercised without Meta credentials. The "login" is a local page that
 * immediately redirects back with a fake code. Captions containing
 * `[fail]` simulate a permanent failure, `[retry]` a transient one.
 */
export class MockMetaProvider implements MetaProvider {
  private containers = new Map<string, { polls: number; caption: string }>();

  buildAuthorizationUrl({ state, redirectUri }: { state: string; scopes: MetaScope[]; redirectUri: string }): string {
    const u = new URL(redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("code", "mock-code");
    return u.toString();
  }

  async exchangeCodeForToken(): Promise<MetaTokenInfo> {
    return { accessToken: "mock-short-token", tokenType: "bearer", expiresAt: new Date(Date.now() + 3600_000), scopes: [] };
  }

  async exchangeForLongLivedToken(): Promise<MetaTokenInfo> {
    return { accessToken: "mock-long-token", tokenType: "bearer", expiresAt: new Date(Date.now() + 60 * 86400_000), scopes: [] };
  }

  async debugToken(): Promise<MetaDebugTokenResult> {
    return {
      isValid: true,
      scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management"],
      expiresAt: new Date(Date.now() + 60 * 86400_000),
      userId: "mock-user-1",
    };
  }

  async getUserProfile(): Promise<MetaUserProfile> {
    return { id: "mock-user-1", name: "Mock Meta User" };
  }

  async listManagedPages(): Promise<MetaPage[]> {
    return [
      { id: "page-1", name: "Bainsla Music (Mock Page)", pictureUrl: null, accessToken: "mock-page-token-1", instagramBusinessAccountId: "ig-1", tasks: ["CREATE_CONTENT", "MANAGE"] },
      { id: "page-2", name: "Second Mock Page", pictureUrl: null, accessToken: "mock-page-token-2", instagramBusinessAccountId: null, tasks: ["CREATE_CONTENT"] },
    ];
  }

  async getInstagramAccountForPage(_pageToken: string, pageId: string): Promise<MetaInstagramAccount | null> {
    if (pageId !== "page-1") return null;
    return { id: "ig-1", username: "bainslamusic_mock", name: "Bainsla Music", profilePictureUrl: null, facebookPageId: pageId };
  }

  async revokeToken(): Promise<void> {}

  async createInstagramReelContainer({ input }: { igUserId: string; pageToken: string; input: ReelContainerInput }): Promise<{ containerId: string }> {
    this.failIfRequested(input.caption);
    const id = `mock-container-${Math.random().toString(36).slice(2, 10)}`;
    this.containers.set(id, { polls: 0, caption: input.caption });
    return { containerId: id };
  }

  async getContainerStatus({ containerId }: { containerId: string; pageToken: string }): Promise<{ status: ContainerStatus; errorMessage?: string }> {
    const c = this.containers.get(containerId);
    if (!c) return { status: "FINISHED" };
    c.polls += 1;
    return { status: c.polls >= 2 ? "FINISHED" : "IN_PROGRESS" };
  }

  async publishInstagramContainer({ containerId }: { igUserId: string; containerId: string; pageToken: string }): Promise<PublishedMedia> {
    this.containers.delete(containerId);
    const id = `mock-ig-media-${Date.now()}`;
    return { id, permalink: `https://www.instagram.com/reel/${id}/` };
  }

  async getInstagramPublishingLimit(): Promise<{ used: number; quota: number }> {
    return { used: 1, quota: 100 };
  }

  async publishFacebookPageReel({ input }: { pageId: string; pageToken: string; input: ReelContainerInput }): Promise<PublishedMedia> {
    this.failIfRequested(input.caption);
    const id = `mock-fb-video-${Date.now()}`;
    return { id, permalink: `https://www.facebook.com/reel/${id}` };
  }

  private failIfRequested(caption: string) {
    if (caption.includes("[fail]")) throw new MetaApiError("Simulated permanent failure", "VALIDATION", false);
    if (caption.includes("[retry]")) throw new MetaApiError("Simulated transient failure", "META_TEMPORARY_OUTAGE", true);
  }
}
