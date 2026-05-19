/**
 * V2 error-message catalog (Step 11.6, D-11.11).
 *
 * The V2 backend writes ``Job.error`` as one of these shapes when a
 * permanent failure terminates a job:
 *
 *   "permanent: <slug>: <detail>"          (PermanentSTTError path)
 *   "permanent render: <slug>: <detail>"   (PermanentRenderError path)
 *
 * This module parses the raw error and returns a human message
 * suitable for the JobDetail page. The raw error is still
 * displayed in a collapsed "Technical details" expander for
 * support debugging -- this just gives the user a clear next-step
 * action instead of the bare slug.
 *
 * If the error doesn't match either prefix or the slug is unknown,
 * the generic fallback is returned. Operators can update this
 * catalog as new conditions surface (backlog item 51 tracks the
 * 3 remaining STT conditions that aren't slug-classified yet).
 */

// PermanentSTTError slugs (Step 10.2). The first 2 are
// deterministically classified by all 3 providers today; the other
// 3 are documented in the PermanentSTTError contract but require
// provider-specific HTTP response parsing to map (backlog item 51).
const PERMANENT_STT_MESSAGES = {
  empty_file:
    "Your audio file appears empty. Please upload a valid recording.",
  file_too_large:
    "Your file exceeds the size limit for this STT provider. " +
    "Try compressing the audio or use a different provider.",
  unsupported_language:
    "The selected STT provider doesn't support this audio's language. " +
    "Pick a different provider from the wizard's STT step.",
  audio_corrupt:
    "The audio file appears corrupted. Please re-upload.",
  audio_too_short:
    "Audio file too short. Minimum 1 second is required.",
};

// PermanentRenderError slugs (Step 10.3). All 4 are deterministically
// classified by _classify_render_error.
const PERMANENT_RENDER_MESSAGES = {
  ffmpeg_not_found:
    "Server configuration issue (FFmpeg unavailable). " +
    "Please report this to support.",
  disk_full:
    "Server is out of disk space. Please try again later or contact support.",
  source_video_corrupt:
    "The source video file appears corrupted. Please re-upload.",
  encoder_unavailable_no_fallback:
    "No video encoder available on this server. Please contact support.",
};

const GENERIC_FALLBACK =
  "An error occurred during processing. Please contact support.";


/**
 * Parse a raw ``Job.error`` string and return a human message.
 *
 * @param {string|null|undefined} rawError -- the value of Job.error
 * @returns {{ message: string, slug: string|null, kind: string|null }}
 *   message: the user-facing string to display
 *   slug:    the parsed slug ("empty_file", "disk_full", etc.) or null
 *   kind:    "stt" | "render" | null
 *
 * Examples:
 *   parse("permanent: empty_file: audio is 0 bytes")
 *     -> { message: "Your audio file appears empty...",
 *          slug: "empty_file", kind: "stt" }
 *
 *   parse("permanent render: disk_full: no space left on device")
 *     -> { message: "Server is out of disk space...",
 *          slug: "disk_full", kind: "render" }
 *
 *   parse("RuntimeError: something blew up")
 *     -> { message: <GENERIC_FALLBACK>, slug: null, kind: null }
 */
export function parseV2Error(rawError) {
  if (!rawError || typeof rawError !== "string") {
    return { message: GENERIC_FALLBACK, slug: null, kind: null };
  }
  const text = rawError.trim();

  // PermanentRenderError pattern: "permanent render: <slug>: ..."
  // Note: this MUST be checked BEFORE the PermanentSTTError pattern
  // because "permanent render:" starts with "permanent" so the STT
  // regex would match if checked first.
  let m = text.match(/^permanent render: ([a-z_]+)\s*[:|]/);
  if (m) {
    const slug = m[1];
    return {
      message: PERMANENT_RENDER_MESSAGES[slug] || GENERIC_FALLBACK,
      slug,
      kind: "render",
    };
  }

  // PermanentSTTError pattern: "permanent: <slug>: ..."
  m = text.match(/^permanent: ([a-z_]+)\s*[:|]/);
  if (m) {
    const slug = m[1];
    return {
      message: PERMANENT_STT_MESSAGES[slug] || GENERIC_FALLBACK,
      slug,
      kind: "stt",
    };
  }

  // Not a V2 permanent failure. Could be V1 subprocess error, a
  // Python traceback, or an Inngest non-retriable that didn't match.
  // Return the generic fallback; the raw error is still shown in
  // the collapsed "Technical details" expander.
  return { message: GENERIC_FALLBACK, slug: null, kind: null };
}

export const _GENERIC_FALLBACK = GENERIC_FALLBACK;     // exposed for tests
export const _STT_MESSAGES = PERMANENT_STT_MESSAGES;   // exposed for tests
export const _RENDER_MESSAGES = PERMANENT_RENDER_MESSAGES;
