import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * LibraryVideoPicker — inline grid of the user's Library videos so they can choose a
 * source clip WITHOUT leaving the New Job page. onPick(item) → item has {id, title, thumb_url}.
 */
export default function LibraryVideoPicker({ selectedId, onPick }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.listLibrary()
      .then((r) => setItems(Array.isArray(r) ? r : (r?.items || [])))
      .catch(() => setItems([]));
  }, []);

  if (items === null) return <div className="text-gray-500 text-sm py-6 text-center">Loading your Library…</div>;
  if (!items.length) {
    return (
      <div className="text-gray-500 text-sm py-6 text-center">
        No videos in your Library yet. Upload one (the Upload tab), or add videos from the Library page.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[26rem] overflow-y-auto pr-1">
      {items.map((it) => {
        const sel = selectedId === it.id;
        return (
          <button key={it.id} type="button" onClick={() => onPick(it)}
            className={`text-left rounded-lg overflow-hidden border transition
              ${sel ? "border-orange-500 ring-2 ring-orange-500/40" : "border-gray-700 hover:border-gray-500"}`}>
            <div className="aspect-video bg-black flex items-center justify-center">
              {it.thumb_url
                ? <img src={it.thumb_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-gray-600 text-xs">video</span>}
            </div>
            <div className="p-1.5 text-xs text-white truncate bg-[#151922]">{it.title || `Video ${it.id}`}</div>
          </button>
        );
      })}
    </div>
  );
}
