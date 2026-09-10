import type { DestinationStatus, PostStatus } from "@prisma/client";

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PARTIALLY_PUBLISHED: "Partially published",
  FAILED: "Failed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const POST_STATUS_TONE: Record<PostStatus, "slate" | "green" | "amber" | "red" | "indigo" | "sky"> = {
  DRAFT: "slate",
  PENDING_APPROVAL: "amber",
  APPROVED: "sky",
  SCHEDULED: "indigo",
  PUBLISHING: "indigo",
  PUBLISHED: "green",
  PARTIALLY_PUBLISHED: "amber",
  FAILED: "red",
  REJECTED: "red",
  CANCELLED: "slate",
};

export const DEST_STATUS_TONE: Record<DestinationStatus, "slate" | "green" | "amber" | "red" | "indigo" | "sky"> = {
  PENDING: "slate",
  SCHEDULED: "indigo",
  PUBLISHING: "indigo",
  PUBLISHED: "green",
  FAILED: "red",
  CANCELLED: "slate",
};

export const ALL_POST_STATUSES = Object.keys(POST_STATUS_LABEL) as PostStatus[];
