"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { saveSongMetadataAction } from "@/server/actions/media.actions";

export type MetadataValues = {
  songTitle?: string | null;
  artist?: string | null;
  album?: string | null;
  musicLabel?: string | null;
  language?: string | null;
  genre?: string | null;
  mood?: string | null;
  releaseDate?: string | null;
  callToAction?: string | null;
  destinationUrl?: string | null;
  customKeywords?: string[];
  copyrightConfirmed?: boolean;
  internalNotes?: string | null;
};

const LANGUAGES = ["", "Hindi", "Haryanvi", "Punjabi", "Rajasthani", "Bhojpuri", "English", "Other"];
const GENRES = ["", "Haryanvi", "Punjabi", "Bollywood", "Devotional", "Folk", "Hip-Hop", "Romantic", "Sad", "Party", "Other"];
const MOODS = ["", "Energetic", "Romantic", "Sad", "Devotional", "Party", "Chill", "Motivational"];

export function MetadataForm({ slug, assetIds, mode, initial, canEdit }: { slug: string; assetIds: string[]; mode: "single" | "batch"; initial: MetadataValues; canEdit: boolean }) {
  const [state, action] = useActionState(saveSongMetadataAction.bind(null, slug, assetIds, mode), null);
  const ro = !canEdit;
  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? <Alert>{state.error}</Alert> : null}
      {state?.ok ? <Alert kind="success">Saved{mode === "batch" ? ` to ${assetIds.length} videos` : ""}.</Alert> : null}
      {mode === "batch" ? <Alert kind="info">Batch edit: only fields you fill in will be applied to the {assetIds.length} selected videos.</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Song title" htmlFor="songTitle">
          <Input id="songTitle" name="songTitle" defaultValue={initial.songTitle ?? ""} readOnly={ro} />
        </Field>
        <Field label="Singer / Artist" htmlFor="artist">
          <Input id="artist" name="artist" defaultValue={initial.artist ?? ""} readOnly={ro} />
        </Field>
        <Field label="Album" htmlFor="album">
          <Input id="album" name="album" defaultValue={initial.album ?? ""} readOnly={ro} />
        </Field>
        <Field label="Music label" htmlFor="musicLabel">
          <Input id="musicLabel" name="musicLabel" defaultValue={initial.musicLabel ?? ""} readOnly={ro} />
        </Field>
        <Field label="Language" htmlFor="language">
          <Select id="language" name="language" defaultValue={initial.language ?? ""} disabled={ro}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l || (mode === "batch" ? "— keep —" : "—")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Genre" htmlFor="genre">
          <Select id="genre" name="genre" defaultValue={initial.genre ?? ""} disabled={ro}>
            {GENRES.map((l) => (
              <option key={l} value={l}>{l || (mode === "batch" ? "— keep —" : "—")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Mood" htmlFor="mood">
          <Select id="mood" name="mood" defaultValue={initial.mood ?? ""} disabled={ro}>
            {MOODS.map((l) => (
              <option key={l} value={l}>{l || (mode === "batch" ? "— keep —" : "—")}</option>
            ))}
          </Select>
        </Field>
        <Field label="Release date" htmlFor="releaseDate">
          <Input id="releaseDate" name="releaseDate" type="date" defaultValue={initial.releaseDate ?? ""} readOnly={ro} />
        </Field>
        <Field label="Call to action" htmlFor="callToAction" hint="e.g. Full song on YouTube — link in bio">
          <Input id="callToAction" name="callToAction" defaultValue={initial.callToAction ?? ""} readOnly={ro} />
        </Field>
        <Field label="Destination URL" htmlFor="destinationUrl">
          <Input id="destinationUrl" name="destinationUrl" type="url" placeholder="https://" defaultValue={initial.destinationUrl ?? ""} readOnly={ro} />
        </Field>
      </div>
      <Field label="Keywords" htmlFor="customKeywords" hint="Comma separated; used for hashtags and captions.">
        <Input id="customKeywords" name="customKeywords" defaultValue={(initial.customKeywords ?? []).join(", ")} readOnly={ro} />
      </Field>
      <Field label="Internal notes" htmlFor="internalNotes">
        <textarea
          id="internalNotes"
          name="internalNotes"
          rows={2}
          defaultValue={initial.internalNotes ?? ""}
          readOnly={ro}
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </Field>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="hidden" name="copyrightConfirmedPresent" value="1" />
        <input type="checkbox" name="copyrightConfirmed" defaultChecked={initial.copyrightConfirmed ?? false} disabled={ro} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>I confirm we own or have licensed the rights to publish this audio and video.{mode === "batch" ? " (applies to all selected)" : ""}</span>
      </label>
      {canEdit ? <SubmitButton>Save metadata</SubmitButton> : null}
    </form>
  );
}
