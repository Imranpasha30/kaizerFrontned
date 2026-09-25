import React, { useState } from "react";

// Common YouTube video categories (value = categoryId). "" = use the
// channel's saved default. Not exhaustive — the high-frequency ones.
const YT_CATEGORIES = [
  ["", "Channel default"],
  ["25", "News & Politics"],
  ["22", "People & Blogs"],
  ["24", "Entertainment"],
  ["23", "Comedy"],
  ["27", "Education"],
  ["28", "Science & Technology"],
  ["10", "Music"],
  ["17", "Sports"],
  ["20", "Gaming"],
  ["26", "Howto & Style"],
  ["29", "Nonprofits & Activism"],
  ["1", "Film & Animation"],
  ["2", "Autos & Vehicles"],
  ["15", "Pets & Animals"],
  ["19", "Travel & Events"],
];

/**
 * ChannelPublishSettings — collapsible per-channel YouTube publish settings
 * (category / video language / playlist / license / made-for-kids) for ONE
 * destination, pre-filled from that channel's saved defaults (`channel.yt_*`).
 *
 * Anything the operator changes here OVERRIDES the channel default for THIS
 * upload only (the saved Style-Profile default is not modified).
 *
 * Props:
 *   channel  - the channel object (carries yt_category_id, yt_default_language,
 *              yt_playlist_id, yt_license, yt_made_for_kids)
 *   value    - current override object { category_id?, language?, playlist_id?,
 *              license?, made_for_kids? } (controlled by the parent)
 *   onChange - (mergedObject) => void
 */
export default function ChannelPublishSettings({ channel, value, onChange }) {
  const [open, setOpen] = useState(false);
  const v = value || {};
  const set = (k, val) => onChange({ ...v, [k]: val });

  // Displayed value = the operator's override if set, else the channel default.
  const dCat  = v.category_id  ?? (channel?.yt_category_id || "");
  const dLang = v.language     ?? (channel?.yt_default_language || "");
  const dPl   = v.playlist_id  ?? (channel?.yt_playlist_id || "");
  const dLic  = v.license      ?? (channel?.yt_license || "youtube");
  const dMfk  = v.made_for_kids ?? (channel?.yt_made_for_kids ?? false);

  return (
    <div className="mt-2 pl-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-accent2 hover:text-accent underline underline-offset-2"
      >
        {open ? "hide YouTube settings" : "YouTube settings (category · language · playlist · license)"}
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px] rounded border border-border bg-black/40 p-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-500">Category</span>
            <select
              value={dCat}
              onChange={(e) => set("category_id", e.target.value)}
              className="bg-surface border border-border rounded px-1.5 py-1 text-gray-200"
            >
              {YT_CATEGORIES.map(([val, label]) => (
                <option key={val || "default"} value={val}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-500">Video language</span>
            <input
              value={dLang}
              onChange={(e) => set("language", e.target.value)}
              placeholder="te"
              className="bg-surface border border-border rounded px-1.5 py-1 text-gray-200"
            />
          </label>
          <label className="flex flex-col gap-0.5 col-span-2">
            <span className="text-gray-500">Playlist ID (optional — adds the video to it)</span>
            <input
              value={dPl}
              onChange={(e) => set("playlist_id", e.target.value)}
              placeholder="PLxxxxxxxxxxxx"
              className="bg-surface border border-border rounded px-1.5 py-1 text-gray-200"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-500">License</span>
            <select
              value={dLic}
              onChange={(e) => set("license", e.target.value)}
              className="bg-surface border border-border rounded px-1.5 py-1 text-gray-200"
            >
              <option value="youtube">Standard YouTube</option>
              <option value="creativeCommon">Creative Commons</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 self-end pb-1.5">
            <input
              type="checkbox"
              checked={!!dMfk}
              onChange={(e) => set("made_for_kids", e.target.checked)}
              className="accent-accent2"
            />
            <span className="text-gray-300">Made for kids</span>
          </label>
        </div>
      )}
    </div>
  );
}

// Build the `publish_settings_by_channel` payload from a map of overrides,
// limited to the channel ids actually being published to. Sends the displayed
// values (override-or-default) so what the operator sees is what's applied.
export function buildPublishSettingsByChannel(settingsMap, channels, channelIds) {
  const out = {};
  for (const cid of channelIds || []) {
    const ch = (channels || []).find((c) => String(c.id) === String(cid));
    const ov = (settingsMap || {})[String(cid)] || {};
    const entry = {
      category_id:  ov.category_id  ?? (ch?.yt_category_id || ""),
      language:     ov.language     ?? (ch?.yt_default_language || ""),
      playlist_id:  ov.playlist_id  ?? (ch?.yt_playlist_id || ""),
      license:      ov.license      ?? (ch?.yt_license || "youtube"),
      made_for_kids: ov.made_for_kids ?? (ch?.yt_made_for_kids ?? false),
    };
    // Only include channels that have at least one non-empty setting.
    if (entry.category_id || entry.language || entry.playlist_id ||
        entry.license !== "youtube" || entry.made_for_kids) {
      out[String(cid)] = entry;
    }
  }
  return out;
}
