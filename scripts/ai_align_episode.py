#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import tempfile
import traceback
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


DEFAULT_API_BASE = "https://bbc-english-api.1140390745.workers.dev"
MIN_MATCH_SCORE = 0.32
REQUEST_USER_AGENT = "Mozilla/5.0 (compatible; BBCEnglishAligner/1.0; +https://github.com/CuiJie98/english_listening)"


@dataclass
class WordTiming:
  word: str
  start: float
  end: float
  probability: float | None = None


@dataclass
class SentenceSegment:
  speaker: str
  text: str
  tokens: list[str]


def main() -> int:
  parser = argparse.ArgumentParser(description="AI-align BBC transcript sentences using faster-whisper word timestamps.")
  parser.add_argument("--api-base", default=os.environ.get("BBC_API_BASE", DEFAULT_API_BASE))
  parser.add_argument("--admin-secret", default=os.environ.get("ADMIN_SECRET"))
  parser.add_argument("--episode-id", type=int, default=None)
  parser.add_argument("--limit", type=int, default=1)
  parser.add_argument("--model-size", default=os.environ.get("WHISPER_MODEL", "small.en"))
  parser.add_argument("--compute-type", default=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"))
  parser.add_argument("--dry-run", action="store_true")
  parser.add_argument("--force", action="store_true")
  args = parser.parse_args()

  if not args.admin_secret and not args.dry_run:
    print("ADMIN_SECRET is required unless --dry-run is used", file=sys.stderr)
    return 2

  api = ApiClient(args.api_base.rstrip("/"), args.admin_secret)
  episodes = [api.get_json(f"/api/episodes/{args.episode_id}")] if args.episode_id else find_candidate_episodes(api, args.limit)
  if not episodes:
    print("No candidate episodes found.")
    return 0

  from faster_whisper import WhisperModel

  print(f"Loading faster-whisper model: {args.model_size} ({args.compute_type})")
  model = WhisperModel(args.model_size, device="cpu", compute_type=args.compute_type)

  failures = 0
  with tempfile.TemporaryDirectory(prefix="bbc-align-") as tmp:
    workdir = Path(tmp)
    for episode in episodes:
      episode_id = int(episode["id"])
      try:
        process_episode(api, model, episode, workdir, args.force, args.dry_run)
      except Exception as exc:
        failures += 1
        print(f"ERR episode {episode_id}: {exc}", file=sys.stderr)
        traceback.print_exc()

  return 1 if failures else 0


class ApiClient:
  def __init__(self, base_url: str, admin_secret: str | None):
    self.base_url = base_url
    self.admin_secret = admin_secret

  def get_json(self, path: str) -> Any:
    return self._request_json("GET", path)

  def post_json(self, path: str, payload: dict[str, Any]) -> Any:
    return self._request_json("POST", path, payload)

  def audio_url(self, bbc_id: str) -> str:
    return f"{self.base_url}/api/audio/{quote(bbc_id, safe='')}"

  def admin_path(self, path: str) -> str:
    if not self.admin_secret:
      return path
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}{urlencode({'secret': self.admin_secret})}"

  def _request_json(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    url = f"{self.base_url}{path}"
    data = None
    headers = {
      "Accept": "application/json",
      "User-Agent": REQUEST_USER_AGENT,
    }
    if payload is not None:
      data = json.dumps(payload).encode("utf-8")
      headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method)
    try:
      with urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    except HTTPError as exc:
      detail = exc.read().decode("utf-8", errors="replace")
      raise RuntimeError(f"{method} {path} failed: HTTP {exc.code} {detail}") from exc
    except URLError as exc:
      raise RuntimeError(f"{method} {path} failed: {exc}") from exc
    return json.loads(raw)


def find_candidate_episodes(api: ApiClient, limit: int) -> list[dict[str, Any]]:
  data = api.get_json(f"/api/episodes?page=1&limit={max(1, min(limit * 5, 50))}")
  episodes: list[dict[str, Any]] = []
  for item in data.get("episodes", []):
    if item.get("has_transcript"):
      episode = api.get_json(f"/api/episodes/{item['id']}")
      if needs_alignment(episode):
        episodes.append(episode)
    if len(episodes) >= limit:
      break
  return episodes


def needs_alignment(episode: dict[str, Any]) -> bool:
  segments = episode.get("transcript_segments") or []
  if not segments:
    return False
  return not all(isinstance(seg.get("start"), (int, float)) and isinstance(seg.get("end"), (int, float)) for seg in segments)


def process_episode(api: ApiClient, model: Any, episode: dict[str, Any], workdir: Path, force: bool, dry_run: bool) -> None:
  episode_id = int(episode["id"])
  if not force and not needs_alignment(episode):
    print(f"SKIP episode {episode_id}: already aligned")
    return

  raw_segments = episode.get("transcript_segments") or []
  sentences = split_transcript_sentences(raw_segments)
  if not sentences:
    raise RuntimeError("episode has no transcript sentences")

  audio_path = workdir / f"episode-{episode_id}.mp3"
  download_file(api.audio_url(episode["bbc_id"]), audio_path)
  words = transcribe_words(model, audio_path)
  if not words:
    raise RuntimeError("ASR produced no word timestamps")

  aligned_segments = align_sentences(sentences, words)
  payload = {
    "segments": aligned_segments,
    "words": [word_to_json(word) for word in words],
  }

  print(f"OK episode {episode_id}: {len(aligned_segments)} sentence segments, {len(words)} words")
  if dry_run:
    print(json.dumps(payload["segments"][:5], ensure_ascii=False, indent=2))
    return

  result = api.post_json(api.admin_path(f"/api/episodes/{episode_id}/alignment-segments"), payload)
  print(f"WRITE episode {episode_id}: {json.dumps(result, ensure_ascii=False)}")


def download_file(url: str, path: Path) -> None:
  req = Request(url, headers={"User-Agent": REQUEST_USER_AGENT})
  with urlopen(req, timeout=120) as resp:
    path.write_bytes(resp.read())


def transcribe_words(model: Any, audio_path: Path) -> list[WordTiming]:
  segments, _info = model.transcribe(
    str(audio_path),
    language="en",
    beam_size=5,
    word_timestamps=True,
    vad_filter=True,
  )
  words: list[WordTiming] = []
  for segment in segments:
    for word in segment.words or []:
      clean = word.word.strip()
      if not clean or not normalize_tokens(clean):
        continue
      words.append(WordTiming(
        word=clean,
        start=round(float(word.start), 2),
        end=round(float(word.end), 2),
        probability=round(float(word.probability), 3) if word.probability is not None else None,
      ))
  return words


def split_transcript_sentences(raw_segments: list[dict[str, Any]]) -> list[SentenceSegment]:
  sentences: list[SentenceSegment] = []
  for segment in raw_segments:
    speaker = str(segment.get("speaker") or "")
    text = str(segment.get("text") or "").strip()
    for sentence in split_html_aware_sentences(text):
      tokens = normalize_tokens(sentence)
      if tokens:
        sentences.append(SentenceSegment(speaker=speaker, text=sentence, tokens=tokens))
  return sentences


def split_html_aware_sentences(text: str) -> list[str]:
  pieces = re.findall(r".*?(?:[.!?](?=\s|$)|$)", text, flags=re.S)
  return [piece.strip() for piece in pieces if piece and piece.strip()]


def align_sentences(sentences: list[SentenceSegment], words: list[WordTiming]) -> list[dict[str, Any]]:
  word_tokens = [normalize_word(word.word) for word in words]
  aligned: list[dict[str, Any]] = []
  cursor = 0
  previous_end = 0.0

  for sentence in sentences:
    match = find_best_match(sentence.tokens, word_tokens, cursor)
    if match:
      start_idx, end_idx, confidence = match
      cursor = max(cursor, end_idx)
      start = words[start_idx].start
      end = words[end_idx - 1].end
    else:
      estimate_count = max(1, len(sentence.tokens))
      start_idx = min(cursor, len(words) - 1)
      end_idx = min(len(words), start_idx + estimate_count)
      start = max(previous_end, words[start_idx].start)
      end = words[end_idx - 1].end if end_idx > start_idx else start + 2.0
      cursor = max(cursor, end_idx)
      confidence = 0.0

    start = max(round(start, 2), previous_end)
    end = max(round(end, 2), round(start + 0.2, 2))
    previous_end = end
    aligned.append({
      "speaker": sentence.speaker,
      "text": sentence.text,
      "start": start,
      "end": end,
      "confidence": round(confidence, 3),
      "source": "ai",
    })

  return aligned


def find_best_match(tokens: list[str], word_tokens: list[str], cursor: int) -> tuple[int, int, float] | None:
  if not tokens or cursor >= len(word_tokens):
    return None

  token_count = len(tokens)
  max_start = min(len(word_tokens), cursor + max(60, token_count * 4))
  min_len = max(1, int(token_count * 0.45))
  max_len = max(min_len, int(token_count * 2.2) + 8)
  target = " ".join(tokens)
  best: tuple[int, int, float] | None = None
  best_adjusted = -1.0

  for start in range(cursor, max_start):
    local_max_len = min(max_len, len(word_tokens) - start)
    for length in range(min_len, local_max_len + 1):
      end = start + length
      candidate = " ".join(word_tokens[start:end])
      score = SequenceMatcher(None, target, candidate).ratio()
      adjusted = score - max(0, start - cursor) * 0.001
      if adjusted > best_adjusted:
        best = (start, end, score)
        best_adjusted = adjusted

  if best and best[2] >= MIN_MATCH_SCORE:
    return best
  return None


def normalize_tokens(text: str) -> list[str]:
  plain = html.unescape(re.sub(r"<[^>]*>", " ", text)).lower()
  return [token for token in re.findall(r"[a-z0-9']+", plain) if token]


def normalize_word(word: str) -> str:
  tokens = normalize_tokens(word)
  return tokens[0] if tokens else ""


def word_to_json(word: WordTiming) -> dict[str, Any]:
  return {
    "word": word.word,
    "start": word.start,
    "end": word.end,
    "probability": word.probability,
  }


if __name__ == "__main__":
  raise SystemExit(main())
