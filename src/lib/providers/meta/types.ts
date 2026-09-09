/**
 * Provider-neutral contract for everything the app needs from Meta.
 * Implementations: `GraphMetaProvider` (real Graph API, Milestone 4/6) and
 * `MockMetaProvider` (deterministic sandbox for tests, Milestone 5).
 * Access tokens are passed in decrypted only for the duration of a call and
 * must never be logged or returned to the client.
 */

export type MetaScope = string;

export type MetaUserProfile = {
  id: string;
  name: string | null;
};

export type MetaPage = {
  id: string;
  name: string;
  pictureUrl: string | null;
  /** Page access token — long-lived when derived from a long-lived user token. */
  accessToken: string;
  instagramBusinessAccountId: string | null;
  tasks: string[];
};

export type MetaInstagramAccount = {
  id: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  /** Facebook Page the IG professional account is linked through. */
  facebookPageId: string;
};

export type MetaTokenInfo = {
  accessToken: string;
  tokenType: "bearer";
  expiresAt: Date | null;
  scopes: MetaScope[];
};

export type MetaDebugTokenResult = {
  isValid: boolean;
  scopes: MetaScope[];
  expiresAt: Date | null;
  userId: string | null;
};

export type ReelContainerInput = {
  videoUrl: string;
  caption: string;
  shareToFeed?: boolean;
};

export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

export type PublishedMedia = {
  id: string;
  permalink: string | null;
};

export type MetaErrorClass =
  | "VALIDATION"
  | "TOKEN_EXPIRED"
  | "PERMISSION_MISSING"
  | "RATE_LIMITED"
  | "MEDIA_PROCESSING_FAILED"
  | "ACCOUNT_RESTRICTED"
  | "META_TEMPORARY_OUTAGE"
  | "UNKNOWN";

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly classification: MetaErrorClass,
    readonly retryable: boolean,
    readonly graphCode?: number,
    readonly graphSubcode?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export interface MetaProvider {
  buildAuthorizationUrl(params: { state: string; scopes: MetaScope[]; redirectUri: string }): string;
  exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<MetaTokenInfo>;
  exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenInfo>;
  debugToken(token: string): Promise<MetaDebugTokenResult>;
  getUserProfile(token: string): Promise<MetaUserProfile>;
  listManagedPages(token: string): Promise<MetaPage[]>;
  getInstagramAccountForPage(pageToken: string, pageId: string): Promise<MetaInstagramAccount | null>;
  revokeToken(token: string): Promise<void>;

  createInstagramReelContainer(params: { igUserId: string; pageToken: string; input: ReelContainerInput }): Promise<{ containerId: string }>;
  getContainerStatus(params: { containerId: string; pageToken: string }): Promise<{ status: ContainerStatus; errorMessage?: string }>;
  publishInstagramContainer(params: { igUserId: string; containerId: string; pageToken: string }): Promise<PublishedMedia>;
  getInstagramPublishingLimit(params: { igUserId: string; pageToken: string }): Promise<{ used: number; quota: number }>;

  publishFacebookPageReel(params: { pageId: string; pageToken: string; input: ReelContainerInput }): Promise<PublishedMedia>;
}
