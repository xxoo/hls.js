import { logger } from './logger';

// This is a replacement of the native addTextTrack method.
// TextTracks created by the native method are unremovable since their livecycles
// are neither related to the current media nor managed by user code.
export function createTrackNode(
  videoEl: HTMLMediaElement,
  kind: TextTrackKind,
  label: string,
  lang?: string,
  append: boolean = false,
): HTMLTrackElement {
  const el = videoEl.ownerDocument.createElement('track');
  el.kind = kind;
  el.label = label;
  if (lang) {
    el.srclang = lang;
  }
  // To avoid an issue of the built-in captions menu in Chrome
  if (navigator.userAgent.includes('Chrome/')) {
    el.src = 'data:,WEBVTT';
  }
  el.track.mode = 'disabled';
  if (append) {
    videoEl.appendChild(el);
  }
  return el;
}

export function captionsOrSubtitlesFromCharacteristics(
  characteristics?: string,
): TextTrackKind {
  if (characteristics) {
    if (
      /transcribes-spoken-dialog/gi.test(characteristics) &&
      /describes-music-and-sound/gi.test(characteristics)
    ) {
      return 'captions';
    }
  }

  return 'subtitles';
}

export function addCueToTrack(track: TextTrack, cue: VTTCue) {
  // Sometimes there are cue overlaps on segmented vtts so the same
  // cue can appear more than once in different vtt files.
  // This avoid showing duplicated cues with same timecode and text.
  const mode = track.mode;
  if (mode === 'disabled') {
    track.mode = 'hidden';
  }
  if (track.cues && !track.cues.getCueById(cue.id)) {
    try {
      track.addCue(cue);
      if (!track.cues.getCueById(cue.id)) {
        throw new Error(`addCue is failed for: ${cue}`);
      }
    } catch (err) {
      logger.debug(`[texttrack-utils]: ${err}`);
      try {
        const textTrackCue = new (self.TextTrackCue as any)(
          cue.startTime,
          cue.endTime,
          cue.text,
        );
        textTrackCue.id = cue.id;
        track.addCue(textTrackCue);
      } catch (err2) {
        logger.debug(
          `[texttrack-utils]: Legacy TextTrackCue fallback failed: ${err2}`,
        );
      }
    }
  }
  if (mode === 'disabled') {
    track.mode = mode;
  }
}

export function removeCuesInRange(
  track: TextTrack,
  start: number,
  end: number,
  predicate?: (cue: TextTrackCue) => boolean,
) {
  const mode = track.mode;
  if (mode === 'disabled') {
    track.mode = 'hidden';
  }

  if (track.cues && track.cues.length > 0) {
    const cues = getCuesInRange(track.cues, start, end);
    for (let i = 0; i < cues.length; i++) {
      if (!predicate || predicate(cues[i])) {
        track.removeCue(cues[i]);
      }
    }
  }
  if (mode === 'disabled') {
    track.mode = mode;
  }
}

// Find first cue starting at or after given time.
// Modified version of binary search O(log(n)).
function getFirstCueIndexFromTime(
  cues: TextTrackCueList | TextTrackCue[],
  time: number,
): number {
  // If first cue starts at or after time, start there
  if (time <= cues[0].startTime) {
    return 0;
  }
  // If the last cue ends before time there is no overlap
  const len = cues.length - 1;
  if (time > cues[len].endTime) {
    return -1;
  }

  let left = 0;
  let right = len;
  let mid;
  while (left <= right) {
    mid = Math.floor((right + left) / 2);

    if (time < cues[mid].startTime) {
      right = mid - 1;
    } else if (time > cues[mid].startTime && left < len) {
      left = mid + 1;
    } else {
      // If it's not lower or higher, it must be equal.
      return mid;
    }
  }
  // At this point, left and right have swapped.
  // No direct match was found, left or right element must be the closest. Check which one has the smallest diff.
  return cues[left].startTime - time < time - cues[right].startTime
    ? left
    : right;
}

export function getCuesInRange(
  cues: TextTrackCueList | TextTrackCue[],
  start: number,
  end: number,
): TextTrackCue[] {
  const cuesFound: TextTrackCue[] = [];
  const firstCueInRange = getFirstCueIndexFromTime(cues, start);
  if (firstCueInRange > -1) {
    for (let i = firstCueInRange, len = cues.length; i < len; i++) {
      const cue = cues[i];
      if (cue.startTime >= start && cue.endTime <= end) {
        cuesFound.push(cue);
      } else if (cue.startTime > end) {
        return cuesFound;
      }
    }
  }
  return cuesFound;
}
